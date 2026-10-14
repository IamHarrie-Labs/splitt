import { readFile, writeFile } from 'node:fs/promises';
const raw = await readFile(new URL('../server/.secrets/circle-api-key.txt',import.meta.url),'utf8');
const key = raw.replace(/^\uFEFF/,'').trim().replace(/^CIRCLE_API_KEY\s*=\s*/,'').replace(/^["']|["']$/g,'');
if(!/^TEST_API_KEY[:A-Za-z0-9_-]{20,}$/.test(key) || key.length>300) throw new Error('The saved file must contain only a Circle test API key. No key was displayed.');
const file=new URL('../.env',import.meta.url);
let contents=await readFile(file,'utf8');
contents=/^CIRCLE_API_KEY=.*$/m.test(contents)?contents.replace(/^CIRCLE_API_KEY=.*$/m,()=>`CIRCLE_API_KEY=${key}`):contents+`\nCIRCLE_API_KEY=${key}\n`;
await writeFile(file,contents,{mode:0o600});
console.log('Circle test API key imported into the local environment. Key contents were not displayed.');
