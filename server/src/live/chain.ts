import {
  createPublicClient,
  defineChain,
  http,
  parseAbi,
  erc20Abi,
  decodeEventLog,
  encodeFunctionData,
  type Address,
  type Hex,
} from 'viem';
import type { Project } from '@splitt/core';
import type { BatchApproval } from '../store.js';
import type { ChainEvent } from './repository.js';
import { arcRpcFetch } from './rpc.js';
export const ARC_ID = 5042002;
export const USDC = '0x3600000000000000000000000000000000000000' as const;
export const vaultAbi = parseAbi([
  'function owner() view returns (address)',
  'function operator() view returns (address)',
  'function usdc() view returns (address)',
  'function paused() view returns (bool)',
  'function projects(bytes32) view returns (uint256 balance, uint256 reserveMin, uint256 maxPerPayment, uint256 maxPerDay, uint64 version, bool active)',
  'function commitments(bytes32) view returns (bytes32 projectId, address payee, uint256 maxAmount, uint256 paid, uint64 activeAfter, bool partialAllowed, bool cancelled)',
  'function spentOnDay(bytes32,uint256) view returns (uint256)',
  'function executed(bytes32) view returns (bool)',
  'function payBatch((bytes32 planId,bytes32 planHash,bytes32 projectId,uint64 projectVersion,uint64 deadline) a, bytes ownerSignature, (bytes32 executionId,bytes32 commitmentId,uint256 amount)[] items)',
  'function createProject(bytes32 id,uint256 reserveMin,uint256 maxPerPayment,uint256 maxPerDay)',
  'function addCommitment(bytes32 cid,bytes32 pid,address payee,uint256 maxAmount,bool partialAllowed)',
  'function deposit(bytes32 pid,bytes32 invoiceId,uint256 amount)',
  'event PaymentReceived(bytes32 indexed projectId,bytes32 indexed invoiceId,address indexed payer,uint256 amount)',
  'event PaymentAttributed(bytes32 indexed attributionId,bytes32 indexed projectId,bytes32 invoiceId,uint256 amount,bytes32 evidenceHash)',
  'event PayoutExecuted(bytes32 indexed executionId,bytes32 indexed commitmentId,bytes32 indexed projectId,address payee,uint256 amount,bytes32 planHash)',
  'event PlanExecuted(bytes32 indexed planId,bytes32 indexed planHash,bytes32 indexed projectId,uint256 totalAmount)',
]);
export const arc = defineChain({
  id: ARC_ID,
  name: 'Arc Testnet',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.testnet.arc.io'] } },
});
export function batchCalldata(approval: BatchApproval): Hex {
  if (!approval.signature) throw new Error('Owner signature required.');
  return encodeFunctionData({
    abi: vaultAbi,
    functionName: 'payBatch',
    args: [
      {
        ...approval.message,
        projectVersion: BigInt(approval.message.projectVersion),
        deadline: BigInt(approval.message.deadline),
      },
      approval.signature,
      approval.items.map((i) => ({ ...i, amount: BigInt(i.amount) })),
    ],
  });
}
export function arcGateway(vault: Address, owner: Address, operator: Address) {
  const client = createPublicClient({
    chain: arc,
    transport: http(process.env.ARC_RPC_URL ?? arc.rpcUrls.default.http[0], {
      batch: { wait: 20, batchSize: 4 },
      fetchFn: arcRpcFetch,
      timeout: 15000,
      retryCount: 1,
      retryDelay: 1000,
    }),
  });
  const read = <T extends 'owner' | 'operator' | 'usdc' | 'paused'>(name: T) =>
    client.readContract({ address: vault, abi: vaultAbi, functionName: name });
  return {
    async verify() {
      if ((await client.getChainId()) !== ARC_ID) throw new Error('Only Arc Testnet is allowed.');
      if (!(await client.getCode({ address: vault }))) throw new Error('Vault is not deployed.');
      const [actualOwner, actualOperator, token, decimals] = await Promise.all([
        read('owner'),
        read('operator'),
        read('usdc'),
        client.readContract({ address: USDC, abi: erc20Abi, functionName: 'decimals' }),
      ]);
      if (
        actualOwner.toLowerCase() !== owner.toLowerCase() ||
        actualOperator.toLowerCase() !== operator.toLowerCase() ||
        token.toLowerCase() !== USDC.toLowerCase() ||
        decimals !== 6
      )
        throw new Error('Vault owner, operator or USDC configuration mismatch.');
    },
    async owner() {
      return read('owner');
    },
    async head() {
      return client.getBlockNumber();
    },
    async events(from: bigint, to: bigint): Promise<ChainEvent[]> {
      const [vaultLogs, transfers] = await Promise.all([
        client.getLogs({ address: vault, fromBlock: from, toBlock: to }),
        client.getLogs({
          address: USDC,
          event: parseAbi([
            'event Transfer(address indexed from,address indexed to,uint256 value)',
          ])[0],
          args: { to: vault },
          fromBlock: from,
          toBlock: to,
        }),
      ]);
      const result: ChainEvent[] = [];
      for (const log of [...vaultLogs, ...transfers]) {
        if (
          log.removed ||
          log.blockNumber === null ||
          log.logIndex === null ||
          !log.transactionHash
        )
          continue;
        try {
          const decoded = decodeEventLog({
            abi: log.address.toLowerCase() === vault.toLowerCase() ? vaultAbi : erc20Abi,
            data: log.data,
            topics: log.topics,
          });
          result.push({
            id: `${ARC_ID}:${log.transactionHash}:${log.logIndex}`,
            block: String(log.blockNumber),
            txHash: log.transactionHash,
            name: decoded.eventName,
            args: Object.fromEntries(
              Object.entries(decoded.args ?? {}).map(([k, v]) => [k, String(v)]),
            ),
            source: 'arc_testnet',
          });
        } catch {
          /* Ignore unrelated ABI events, never fabricate a receipt. */
        }
      }
      return result;
    },
    async project(metadata: Project) {
      // Setup may have confirmed since the indexer's last head read. Never validate
      // new metadata or owner approvals against viem's cached block number.
      const blockNumber = await client.getBlockNumber({ cacheTime: 0 });
      const block = await client.getBlock({ blockNumber });
      const [p, paused, spent] = await Promise.all([
        client.readContract({
          address: vault,
          abi: vaultAbi,
          functionName: 'projects',
          args: [metadata.onchainId],
          blockNumber,
        }),
        client.readContract({ address: vault, abi: vaultAbi, functionName: 'paused', blockNumber }),
        client.readContract({
          address: vault,
          abi: vaultAbi,
          functionName: 'spentOnDay',
          args: [metadata.onchainId, block.timestamp / 86400n],
          blockNumber,
        }),
      ]);
      if (!p[5]) throw new Error('Create the project on-chain before registering metadata.');
      const commitments = await Promise.all(
        metadata.commitments.map(async (c) => {
          const v = await client.readContract({
            address: vault,
            abi: vaultAbi,
            functionName: 'commitments',
            args: [c.onchainId],
            blockNumber,
          });
          if (
            v[0] !== metadata.onchainId ||
            v[1].toLowerCase() !== c.payee.toLowerCase() ||
            String(v[2]) !== c.maximum ||
            v[5] !== c.partialAllowed
          )
            throw new Error('Commitment metadata does not match the vault.');
          return { ...c, paid: String(v[3]), activeAfter: Number(v[4]), cancelled: v[6] };
        }),
      );
      if (p[4] > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Unsupported project version.');
      return {
        project: {
          ...metadata,
          balance: String(p[0]),
          reserve: String(p[1]),
          perPayment: String(p[2]),
          perDay: String(p[3]),
          version: Number(p[4]),
          spentToday: String(spent),
          paused,
          commitments,
        },
        now: new Date(Number(block.timestamp) * 1000),
        block: String(blockNumber),
      };
    },
    async executed(ids: Hex[]) {
      return Promise.all(
        ids.map((id) =>
          client.readContract({
            address: vault,
            abi: vaultAbi,
            functionName: 'executed',
            args: [id],
          }),
        ),
      );
    },
    async authorizationExpired(approval: BatchApproval) {
      const block = await client.getBlock({ blockTag: 'latest' });
      return block.timestamp > BigInt(approval.message.deadline);
    },
    async simulate(approval: BatchApproval) {
      if (!approval.signature) throw new Error('Signature required.');
      await this.verify();
      await client.simulateContract({
        account: operator,
        address: vault,
        abi: vaultAbi,
        functionName: 'payBatch',
        args: [
          {
            ...approval.message,
            projectVersion: BigInt(approval.message.projectVersion),
            deadline: BigInt(approval.message.deadline),
          },
          approval.signature,
          approval.items.map((i) => ({ ...i, amount: BigInt(i.amount) })),
        ],
      });
    },
    async receipt(hash: Hex) {
      try {
        return (await client.getTransactionReceipt({ hash })).status;
      } catch (error) {
        if ((error as Error).name === 'TransactionReceiptNotFoundError') return undefined;
        throw error;
      }
    },
  };
}
export type ArcGateway = ReturnType<typeof arcGateway>;
