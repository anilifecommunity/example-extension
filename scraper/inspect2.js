const https = require('https');
const fs = require('fs');
function get(url, headers={}){
  return new Promise((resolve,reject)=>{
    https.get(url, {headers: {'User-Agent':'Mozilla/5.0', ...headers}}, res=>{
      let d=''; res.on('data',c=>d+=c); res.on('end',()=>resolve({status:res.statusCode, body:d}));
    }).on('error',reject);
  });
}
(async()=>{
  const id='YaXd-lvb0';
  const r=await get('https://player.abyssplayer.com/'+id, {'Referer':'https://animesalt.cx/'});
  fs.writeFileSync('abyss.html', r.body);
  const t=r.body;
  for (const kw of ['fetch(','XMLHttpRequest','axios','source','file','src','api','/api','getVideo','mp4','m3u8','cdn']) {
    let i=0, count=0;
    while((i=t.indexOf(kw,i))!==-1){ count++; i+=kw.length; }
    console.log(kw, count);
  }
})();