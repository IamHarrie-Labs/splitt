import { readFile, writeFile } from 'node:fs/promises';
const publicRoot = new URL('../video/public/', import.meta.url);
const scenes = JSON.parse(await readFile(new URL('scenes.json', publicRoot), 'utf8'));
function duration(buffer) {
  let byteRate = 0, dataLength = 0;
  for (let offset = 12; offset + 8 <= buffer.length;) {
    const name = buffer.toString('ascii', offset, offset + 4), length = buffer.readUInt32LE(offset + 4);
    if (name === 'fmt ') byteRate = buffer.readUInt32LE(offset + 16);
    if (name === 'data') dataLength += length;
    offset += 8 + length + (length % 2);
  }
  if (!byteRate || !dataLength) throw new Error('Narration WAV format not recognized.');
  return dataLength / byteRate;
}
const timestamp = seconds => new Date(Math.round(seconds * 1000)).toISOString().slice(11,23).replace('.',',');
let index = 1;
const captions = [];
for (const [sceneIndex, scene] of scenes.entries()) {
  const seconds = duration(await readFile(new URL(`voice-${sceneIndex}.wav`, publicRoot)));
  if (seconds > 19.4) throw new Error('Narration exceeds scene dwell time.');
  const words = scene.narration.split(/\s+/);
  for (let start = 0; start < words.length; start += 12) {
    const chunk = words.slice(start,start+12);
    captions.push(`${index++}\n${timestamp(sceneIndex*20+seconds*start/words.length)} --> ${timestamp(sceneIndex*20+seconds*Math.min(start+12,words.length)/words.length)}\n${chunk.slice(0,6).join(' ')}\n${chunk.slice(6).join(' ')}\n`);
  }
}
await writeFile(new URL('captions.srt',publicRoot),captions.join('\n'));
console.log(`${index-1} caption segments saved. Word timing is approximate; scene narration timing is verified.`);
