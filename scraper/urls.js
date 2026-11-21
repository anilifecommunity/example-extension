const fs=require('fs');
const t=fs.readFileSync('abyss.html','utf8');
const urls=[...new Set(t.match(/https?:\/\/[^\s"'<>]+/g)||[])];
for(const u of urls){
  if(!/iamcdn|google|morphify|cdnjs|jwplayer|streamindia/i.test(u)) console.log(u);
}