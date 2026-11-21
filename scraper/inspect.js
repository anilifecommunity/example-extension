const https = require('https');
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
  const t=r.body;
  console.log('status',r.status);
  console.log('m3u8', t.includes('m3u8'), 'mp4', t.includes('mp4'));
  const urls=[...new Set(t.match(/https?:\/\/[^\s"'<>]+/g)||[])];
  for(const u of urls){ if(/mp4|m3u8|cdn|media|video|stream|abyss|master/i.test(u)) console.log(u); }
  // print around jwplayer setup maybe
  const i=t.indexOf('setup(');
  console.log('setup idx', i);
  if(i!==-1) console.log(t.slice(i, i+500));
})();
