// ZEUS Server - por Benja Ruizdiaz
const http = require('http');
const https = require('https');
const { execSync } = require('child_process');
 
const PORT = process.env.PORT || 3001;
const GROQ_API_KEY      = process.env.GROQ_API_KEY      || '';
const REPLICATE_API_KEY = process.env.REPLICATE_API_KEY || '';
const ADMIN_PASSWORD    = process.env.ADMIN_PASSWORD    || 'ADMINbenja2026';
const SUPABASE_URL      = process.env.SUPABASE_URL      || '';
const SUPABASE_KEY      = process.env.SUPABASE_KEY      || '';
 
try { require.resolve('pdf-parse'); }
catch(e) { try { execSync('npm install pdf-parse', { stdio:'inherit' }); } catch(e) {} }
 
const SYSTEMS = {
  FREE: `Sos ZEUS FREE, una IA creada por Benja Ruizdiaz. Modo amigable únicamente.
Cuando pidan imagen respondé SOLO con: {"action":"generate_image","prompt":"[prompt detallado en inglés, photorealistic, 8k, highly detailed, sharp focus, cinematic lighting, masterpiece]","description":"[descripción en español]"}
Podés analizar imágenes. Respondés en español argentino. Nunca inventás info ni generás contenido ofensivo.`,
  BASICO: `Sos ZEUS BÁSICO, una IA creada por Benja Ruizdiaz. Modo amigable.
Cuando pidan imagen respondé SOLO con: {"action":"generate_image","prompt":"[prompt detallado en inglés, photorealistic, 8k, highly detailed, sharp focus, cinematic lighting, masterpiece]","description":"[descripción en español]"}
Podés analizar imágenes y PDFs. Respondés en español argentino.`,
  PRO: `Sos ZEUS PRO, una IA avanzada creada por Benja Ruizdiaz. Todos los modos: amigable, profesional, motivador. Generás scripts de ventas y copies.
Cuando pidan imagen respondé SOLO con: {"action":"generate_image","prompt":"[prompt ultra detallado en inglés, photorealistic, 8k uhd, masterpiece]","description":"[descripción en español]"}
Podés analizar imágenes, PDFs y documentos. Respondés en español argentino.`,
  ELITE: `Sos ZEUS ÉLITE, la versión más poderosa creada por Benja Ruizdiaz. Todo ilimitado: todos los modos, scripts, copies, estrategias, análisis.
Cuando pidan imagen respondé SOLO con: {"action":"generate_image","prompt":"[prompt cinematográfico ultra detallado en inglés, photorealistic, 8k uhd, masterpiece]","description":"[descripción en español]"}
Respondés en español argentino.`
};
 
function supabaseReq(method, path, body, cb) {
  if (!SUPABASE_URL || !SUPABASE_KEY) { if(cb) cb(null, []); return; }
  const postData = body ? JSON.stringify(body) : null;
  const url = new URL(SUPABASE_URL);
  const opts = {
    hostname: url.hostname,
    path: `/rest/v1/${path}`,
    method,
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'resolution=merge-duplicates'
    }
  };
  if (postData) opts.headers['Content-Length'] = Buffer.byteLength(postData);
  const req = https.request(opts, res => {
    let data = '';
    res.on('data', c => data += c);
    res.on('end', () => { try { if(cb) cb(null, data ? JSON.parse(data) : {}); } catch(e) { if(cb) cb(null, {}); } });
  });
  req.on('error', () => { if(cb) cb(null, {}); });
  if (postData) req.write(postData);
  req.end();
}
 
function groqReq(messages, plan, imgB64, imgType, cb) {
  const system = SYSTEMS[plan] || SYSTEMS.FREE;
  const hasImg = imgB64 && imgB64.length > 0;
  let msgs;
  if (hasImg) {
    const last = messages[messages.length - 1];
    msgs = [
      ...messages.slice(0,-1).map(m => ({ role:m.role, content:m.content })),
      { role:'user', content:[
        { type:'image_url', image_url:{ url:`data:${imgType||'image/jpeg'};base64,${imgB64}` } },
        { type:'text', text:last.content||'Analizá esta imagen.' }
      ]}
    ];
  } else {
    msgs = messages.map(m => ({ role:m.role, content:m.content }));
  }
  const postData = JSON.stringify({
    model: hasImg ? 'meta-llama/llama-4-scout-17b-16e-instruct' : 'llama-3.3-70b-versatile',
    messages: [{ role:'system', content:system }, ...msgs],
    max_tokens: plan === 'ELITE' ? 2048 : 1024,
    temperature: 0.7
  });
  const req = https.request({
    hostname: 'api.groq.com',
    path: '/openai/v1/chat/completions',
    method: 'POST',
    headers: { 'Content-Type':'application/json', 'Authorization':`Bearer ${GROQ_API_KEY}`, 'Content-Length':Buffer.byteLength(postData) }
  }, res => {
    let data = '';
    res.on('data', c => data += c);
    res.on('end', () => { try { cb(null, JSON.parse(data)); } catch(e) { cb(e); } });
  });
  req.on('error', cb);
  req.write(postData);
  req.end();
}
 
async function parsePDF(b64) {
  try { const p = require('pdf-parse'); const d = await p(Buffer.from(b64,'base64')); return d.text.substring(0,8000); }
  catch(e) { return null; }
}
 
function replicateReq(path, method, body, cb) {
  const postData = body ? JSON.stringify(body) : null;
  const req = https.request({
    hostname: 'api.replicate.com', path, method,
    headers: { 'Authorization':`Bearer ${REPLICATE_API_KEY}`, 'Content-Type':'application/json', ...(postData && {'Content-Length':Buffer.byteLength(postData)}) }
  }, res => {
    let data = '';
    res.on('data', c => data += c);
    res.on('end', () => { try { cb(null, JSON.parse(data)); } catch(e) { cb(e); } });
  });
  req.on('error', cb);
  if (postData) req.write(postData);
  req.end();
}
 
function dlImg(url, cb) {
  https.get(url, res => {
    if (res.statusCode === 301 || res.statusCode === 302) { dlImg(res.headers.location, cb); return; }
    const chunks = [];
    res.on('data', c => chunks.push(c));
    res.on('end', () => cb(null, Buffer.concat(chunks)));
  }).on('error', cb);
}
 
function pollReplicate(id, res, attempts) {
  if (attempts > 60) { res.writeHead(500); res.end(JSON.stringify({ error:'Tiempo agotado' })); return; }
  setTimeout(() => {
    replicateReq(`/v1/predictions/${id}`, 'GET', null, (err, data) => {
      if (err) { pollReplicate(id, res, attempts+1); return; }
      if (data.status === 'succeeded') {
        const url = Array.isArray(data.output) ? data.output[0] : data.output;
        dlImg(url, (err, buf) => {
          if (err) { res.writeHead(500); res.end(JSON.stringify({ error:'Error descarga' })); return; }
          res.writeHead(200, {'Content-Type':'application/json'});
          res.end(JSON.stringify({ success:true, imageBase64:buf.toString('base64') }));
        });
      } else if (data.status === 'failed') {
        res.writeHead(500); res.end(JSON.stringify({ error:data.error||'Falló' }));
      } else { pollReplicate(id, res, attempts+1); }
    });
  }, 2000);
}
 
const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
  if (req.method === 'GET') { res.writeHead(200); res.end('⚡ ZEUS activo'); return; }
 
  let body = '';
  req.on('data', c => body += c);
  req.on('end', async () => {
    let parsed;
    try { parsed = JSON.parse(body); }
    catch(e) { res.writeHead(400); res.end(JSON.stringify({ error:'JSON inválido' })); return; }
 
    const plan = (parsed.plan || 'FREE').toUpperCase();
    const sessionId = parsed.sessionId || 'unknown';
 
    if (req.url === '/verify-admin') {
      res.writeHead(200, {'Content-Type':'application/json'});
      res.end(JSON.stringify({ success: parsed.password === ADMIN_PASSWORD }));
      return;
    }
 
    if (req.url === '/admin/chats') {
      if (parsed.password !== ADMIN_PASSWORD) { res.writeHead(401); res.end(JSON.stringify({ error:'No autorizado' })); return; }
      supabaseReq('GET', 'chats?order=updated_at.desc&limit=100', null, (err, data) => {
        res.writeHead(200, {'Content-Type':'application/json'});
        res.end(JSON.stringify({ success:true, chats:Array.isArray(data)?data:[] }));
      });
      return;
    }
 
    if (req.url === '/admin/stats') {
      if (parsed.password !== ADMIN_PASSWORD) { res.writeHead(401); res.end(JSON.stringify({ error:'No autorizado' })); return; }
      supabaseReq('GET', 'stats?order=created_at.desc&limit=500', null, (err, stats) => {
        supabaseReq('GET', 'chats?select=id,session_id,plan', null, (err2, chats) => {
          const s = Array.isArray(stats)?stats:[];
          const c = Array.isArray(chats)?chats:[];
          const sessions = [...new Set(c.map(x=>x.session_id))].length;
          const byPlan = {};
          c.forEach(x => { byPlan[x.plan] = (byPlan[x.plan]||0)+1; });
          res.writeHead(200, {'Content-Type':'application/json'});
          res.end(JSON.stringify({ success:true, totalChats:c.length, totalSessions:sessions, byPlan, recentStats:s.slice(0,50) }));
        });
      });
      return;
    }
 
    if (req.url === '/admin/delete-chat') {
      if (parsed.password !== ADMIN_PASSWORD) { res.writeHead(401); res.end(JSON.stringify({ error:'No autorizado' })); return; }
      supabaseReq('DELETE', `chats?id=eq.${parsed.chatId}`, null, () => {
        res.writeHead(200, {'Content-Type':'application/json'});
        res.end(JSON.stringify({ success:true }));
      });
      return;
    }
 
    if (req.url === '/chat') {
      console.log(`💬 Chat [${plan}]`);
      let messages = parsed.messages;
      if (parsed.pdfBase64) {
        const txt = await parsePDF(parsed.pdfBase64);
        const last = messages[messages.length-1];
        messages = [...messages.slice(0,-1), { role:'user', content:(last.content?last.content+'\n\n':'')+(txt?`📄 PDF:\n\n${txt}\n\nAnalizá este documento.`:'[PDF no legible]') }];
      }
      groqReq(messages, plan, parsed.imageBase64, parsed.imageType, (err, data) => {
        if (err) { res.writeHead(500); res.end(JSON.stringify({ error:err.message })); return; }
        if (data.error) { res.writeHead(400); res.end(JSON.stringify({ error:data.error.message||JSON.stringify(data.error) })); return; }
        const text = data.choices?.[0]?.message?.content || 'No pude responder.';
        if (parsed.chatId) {
          supabaseReq('POST', 'chats', { id:parsed.chatId, session_id:sessionId, plan, messages:parsed.messages, preview:parsed.messages.find(m=>m.role==='user')?.content?.substring(0,100)||'Chat', updated_at:new Date().toISOString() }, null);
        }
        supabaseReq('POST', 'stats', { session_id:sessionId, event:'chat', plan }, null);
        res.writeHead(200, {'Content-Type':'application/json'});
        res.end(JSON.stringify({ success:true, text }));
      });
    }
 
    else if (req.url === '/generate-image') {
      console.log(`🎨 Imagen [${plan}]`);
      supabaseReq('POST', 'stats', { session_id:sessionId, event:'image', plan }, null);
      replicateReq('/v1/predictions', 'POST', {
        version: 'black-forest-labs/flux-schnell',
        input: { prompt:parsed.prompt, num_outputs:1, aspect_ratio:'1:1', output_format:'jpg', output_quality:90, num_inference_steps:4 }
      }, (err, data) => {
        if (err) { res.writeHead(500); res.end(JSON.stringify({ error:err.message })); return; }
        if (data.error) { res.writeHead(400); res.end(JSON.stringify({ error:data.error })); return; }
        if (!data.id) { res.writeHead(500); res.end(JSON.stringify({ error:'Sin prediction ID' })); return; }
        pollReplicate(data.id, res, 0);
      });
    }
 
    else { res.writeHead(404); res.end(JSON.stringify({ error:'Ruta no encontrada' })); }
  });
});
 
server.listen(PORT, () => {
  console.log(`⚡ ZEUS Server en puerto ${PORT}`);
});