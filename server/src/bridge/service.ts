import { randomUUID } from 'node:crypto';
import { bridgeInput, txHashSchema, type BridgeIntent } from '../../../packages/core/src/cctp.js';
import type { Address, Hex } from 'viem';
import type { LiveRepository } from '../live/repository.js';
import type { CctpGateway } from './gateway.js';
const fail = (message: string, statusCode = 409): never => {
  throw Object.assign(new Error(message), { statusCode });
};
export class BridgeService {
  constructor(
    public repo: LiveRepository,
    public gateway: CctpGateway,
    public vault: Address,
    public owner: Address,
  ) {}
  async intent(id: string) {
    return (
      (await this.repo.snapshot()).bridgeIntents?.find((i) => i.id === id) ??
      fail('Bridge intent not found.', 404)
    );
  }
  async prepare(input: unknown) {
    const data = bridgeInput.parse(input);
    const project =
      (await this.repo.snapshot()).projects.find((p) => p.id === data.projectId) ??
      fail('Project not found.', 404);
    if (
      ![this.owner, project.clientWallet].some((a) => a.toLowerCase() === data.payer.toLowerCase())
    )
      fail('Use the registered client wallet or the workspace owner funding on its behalf.', 400);
    const readiness = await this.gateway.preflight(data.payer as Address, data.amount);
    if (BigInt(data.maxFee) < BigInt(readiness.minimumFee))
      fail('The fee limit is below Circle’s current minimum standard-transfer fee.', 400);
    if (!readiness.funded)
      fail('Fund the source wallet with Base Sepolia USDC and ETH before preparing a burn.', 400);
    const intent: BridgeIntent = {
      id: randomUUID(),
      projectId: project.id,
      projectOnchainId: project.onchainId,
      invoiceRef: project.invoiceRef,
      payer: data.payer as Address,
      vault: this.vault,
      amount: data.amount,
      maxFee: data.maxFee,
      createdAt: new Date().toISOString(),
      state: 'prepared',
    };
    await this.repo.transaction((s) => {
      (s.bridgeIntents ??= []).push(intent);
    });
    return { intent, readiness, ...this.gateway.prepareBurn(intent, readiness.allowance) };
  }
  async resume(id: string) {
    const intent = await this.intent(id);
    if (intent.state !== 'prepared') return { intent, approve: null, burn: null };
    const readiness = await this.gateway.preflight(intent.payer, intent.amount);
    if (!readiness.funded || BigInt(readiness.minimumFee) > BigInt(intent.maxFee))
      fail('Source funding or fees changed. Review before burning.');
    return { intent, ...this.gateway.prepareBurn(intent, readiness.allowance) };
  }
  async recordBurn(id: string, input: unknown) {
    const hash = txHashSchema.parse(input) as Hex,
      intent = await this.intent(id);
    if (intent.sourceTx) {
      if (intent.sourceTx.toLowerCase() !== hash.toLowerCase())
        fail('This intent already has a different burn.');
      return intent;
    }
    const proof = await this.gateway.verifyBurn(intent, hash);
    return this.repo.transaction((s) => {
      const current = s.bridgeIntents!.find((i) => i.id === id)!;
      if (current.sourceTx && current.sourceTx.toLowerCase() !== hash.toLowerCase())
        fail('Burn changed during confirmation.');
      if (s.bridgeIntents!.some((i) => i.id !== id && i.sourceKey === proof.sourceKey))
        fail('This burn is already assigned to another intent.');
      if (current.state === 'prepared') Object.assign(current, proof, { state: 'burn_confirmed' });
      return current;
    });
  }
  async poll(id: string) {
    const intent = await this.intent(id);
    if (['minted', 'attributed'].includes(intent.state))
      return { intent, mint: null, alreadyMinted: true };
    if (!intent.sourceTx) fail('Confirm the source burn first.');
    const proof = await this.gateway.attestation(intent);
    if (!proof) return { intent, mint: null, alreadyMinted: false };
    const saved = await this.repo.transaction((s) => {
      const current = s.bridgeIntents!.find((i) => i.id === id)!;
      if (s.bridgeIntents!.some((i) => i.id !== id && i.nonce === proof.nonce))
        fail('This Circle message is already linked to another intent.');
      if (current.nonce && current.nonce !== proof.nonce)
        fail('Circle message nonce changed. Owner review required.');
      const { alreadyMinted, ...evidence } = proof;
      if (!['minted', 'attributed'].includes(current.state))
        Object.assign(current, evidence, { state: 'attested' });
      return current;
    });
    return {
      intent: saved,
      mint: proof.alreadyMinted ? null : this.gateway.mintCall(saved),
      alreadyMinted: proof.alreadyMinted,
    };
  }
  async recordMint(id: string, input: unknown) {
    const hash = txHashSchema.parse(input) as Hex,
      intent = await this.intent(id);
    if (intent.mintTx) {
      if (intent.mintTx.toLowerCase() !== hash.toLowerCase())
        fail('A different mint is already recorded.');
      return intent;
    }
    if (intent.state !== 'attested')
      fail('Obtain the verified attestation before confirming the mint.');
    const proof = await this.gateway.verifyMint(intent, hash);
    return this.repo.transaction((s) => {
      const current = s.bridgeIntents!.find((i) => i.id === id)!;
      if (current.mintTx && current.mintTx.toLowerCase() !== hash.toLowerCase())
        fail('Mint changed during confirmation.');
      if (s.bridgeIntents!.some((i) => i.id !== id && i.attributionId === proof.attributionId))
        fail('This mint has already been linked to another intent.');
      if (current.state === 'attested') Object.assign(current, proof, { state: 'minted' });
      return current;
    });
  }
  async attribution(id: string) {
    const intent = await this.intent(id);
    if (intent.state !== 'minted') fail('A verified, unattributed mint is required.');
    return { intent, transaction: await this.gateway.prepareAttribution(intent) };
  }
  async recordAttribution(id: string, input: unknown) {
    const hash = txHashSchema.parse(input) as Hex,
      intent = await this.intent(id);
    if (intent.attributionTx) {
      if (intent.attributionTx.toLowerCase() !== hash.toLowerCase())
        fail('A different attribution is already recorded.');
      return intent;
    }
    if (intent.state !== 'minted') fail('Verify the mint before confirming owner attribution.');
    const proof = await this.gateway.verifyAttribution(intent, hash);
    return this.repo.transaction((s) => {
      const current = s.bridgeIntents!.find((i) => i.id === id)!;
      if (current.attributionTx && current.attributionTx.toLowerCase() !== hash.toLowerCase())
        fail('Attribution changed during confirmation.');
      Object.assign(current, proof, { state: 'attributed' });
      // No offchain balance credit: the existing receipt indexer will see PaymentAttributed.
      return current;
    });
  }
}
