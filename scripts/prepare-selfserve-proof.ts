import {readFile,writeFile} from 'node:fs/promises';
import {generatePrivateKey,privateKeyToAccount} from 'viem/accounts';
import {createPublicClient,http,formatEther} from 'viem';
import {arc} from '../server/src/live/chain.js';
const file=new URL('../server/.secrets/selfserve-proof-wallets.json',import.meta.url);
let wallets:{address:string;privateKey:`0x${string}`}[];
try{wallets=JSON.parse(await readFile(file,'utf8'));}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;wallets=Array.from({length:2},()=>{const privateKey=generatePrivateKey();return {address:privateKeyToAccount(privateKey).address,privateKey};});await writeFile(file,JSON.stringify(wallets),{mode:0o600,flag:'wx'});}
const owner=JSON.parse(await readFile(new URL('../docs/owner-wallet.json',import.meta.url),'utf8')).address;
const client=createPublicClient({chain:arc,transport:http()});
if(await client.getChainId()!==5042002)throw new Error('Only Arc Testnet is allowed.');
const balance=await client.getBalance({address:owner});
const report={source:'controlled_test_plan',chainId:5042002,owner,fundingPerWalletNativeUsdc:'3',maximumFundingNativeUsdc:'6',ownerNativeUsdc:formatEther(balance),sufficientForFundingAndGas:balance>=6500000000000000000n,wallets:wallets.map(w=>w.address),realBusinesses:0};
await writeFile(new URL('../docs/selfserve-proof-plan.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
