const fs=require('fs');
const t=fs.readFileSync('abyss.html','utf8');
let i=0;
while((i=t.indexOf('fetch(',i))!==-1){
  console.log('=== fetch at', i);
  console.log(t.slice(Math.max(0,i-300), i+500));
  console.log('\n');
  i+=6;
}