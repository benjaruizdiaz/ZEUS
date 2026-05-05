// ============================================
//   ZEUS - Servidor con Supabase
//   Chat: Groq | Imágenes: Replicate | DB: Supabase
//   por Benja Ruizdiaz
// ============================================

const http = require('http');
const https = require('https');
const { execSync } = require('child_process');

const PORT = process.env.PORT || 3001;

// ── KEYS ─────────────────────────────────────────────
const GROQ_API_KEY      = process.env.GROQ_API_KEY      || 'TU_API_KEY_DE_GROQ_ACÁ';
const REPLICATE_API_KEY = process.env.REPLICATE_API_KEY || 'TU_TOKEN_DE_REPLICATE_ACÁ';
const ADMIN_PASSWORD    = process.env.ADMIN_PASSWORD    || 'ADMINZEUS2026';
const SUPABASE_KEY      = process.env.SUPABASE_KEY      || '';
const SUPABASE_KEY      = process.env.SUPABASE_KEY      || '';

// Instalar pdf-parse si no está
try { require.resolve('pdf-parse'); }
catch(e) { try { execSync('npm install pdf-parse', { stdio:'inherit' }); } catch(e) {} }

// ── SYSTEM PROMPTS ────────────────────────────────────
const SYSTEMS = {
  FREE: `Sos ZEUS FREE, una IA creada por Benja Ruizdiaz. Modo amigable únicamente.
Cuando pidan imagen respondé SOLO con: {"action":"generate_image","prompt":"[prompt detallado en inglés, photorealistic, 8k, highly detailed, sharp focus, cinematic lighting, masterpiece]","description":"[descripción en español]"}
Podés analizar imágenes. Respondés en español argentino. Nunca inventás info ni generás contenido ofensivo.`,

  BASICO: `Sos ZEUS BÁSICO, una IA creada por Benja Ruizdiaz. Modo amigable.
Cuando pidan imagen respondé SOLO con: {"action":"generate_image","prompt":"[prompt detallado en inglés, photorealistic, 8k, highly detailed, sharp focus, cinematic lighting, masterpiece]","description":"[descripción en español]"}
Podés analizar imágenes y PDFs. Respondés en español argentino. Nunca inventás info ni generás contenido ofensivo.`,

  PRO: `Sos ZEUS PRO, una IA avanzada creada por Benja Ruizdiaz. Todos los modos:
- AMIGABLE: cercano, natural, positivo
- PROFESIONAL: claro, directo, estructurado
- MOTIVADOR: alentador, enfocado en soluciones
Generás scripts de ventas y copies persuasivos.
Cuando pidan imagen respondé SOLO con: {"action":"generate_image","prompt":"[prompt ultra detallado en inglés, photorealistic, 8k uhd, highly detailed, sharp focus, cinematic lighting, masterpiece]","description":"[descripción en español]"}
Podés analizar imágenes, PDFs y documentos. Respondés en español argentino.`,

  ELITE: `Sos ZEUS ÉLITE, la versión más poderosa creada por Benja Ruizdiaz. Todo ilimitado:
- Todos los modos de personalidad
- Scripts de ventas profesionales
- Copies de alto impacto
- Estrategias de negocios completas
- Análisis profundo de documentos e imágenes
Cuando pidan imagen respondé SOLO con: {"action":"generate_image","prompt":"[prompt cinematográfico ultra detallado en inglés, photorealistic, 8k uhd, highly detailed, masterpiece]","description":"[descripción en español]"}
Respondés en español argentino.`
};

// ── SUPABASE HELPER ───────────────────────────────────
function supabaseRequest(method, path, body, callback) {
  const postData = body ? JSON.stringify(body) : null;
  const url = new URL(SUPABASE_URL);
  const options = {
    hostname: url.hostname,
    path: `/rest/v1/${path}`,
    method,
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': method === 'POST' ? 'resolution=merge-duplicates' : ''
    }
  };
  if (postData) options.headers['Content-Length'] = Buffer.byteLength(postData);

  const req = https.request(options, res => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      try { callback(null, data ? JSON.parse(data) : {}); }
      catch(e) { callback(null, {}); }
    });
  });
  req.on('error', err => { console.error('Supabase error:', err.message); callback(null, {}); });
  if (postData) req.write(postData);
  req.end();
}

function saveChat(chatData) {
  supabaseRequest('POST', 'chats', chatData, (err, res) => {
    if (err) console.error('Error guardando chat:', err);
    else console.log('💾 Chat guardado en Supabase');
  });
}

function saveStat(statData) {
  supabaseRequest('POST', 'stats', statData, () => {});
}

// ── GROQ ──────────────────────────────────────────────
function groqRequest(messages, plan, imageBase64, imageType, callback) {
  const system = SYSTEMS[plan] || SYSTEMS.FREE;
  const hasImage = imageBase64 && imageBase64.length > 0;
  let formattedMessages;
  if (hasImage) {
    const lastMsg = messages[messages.length - 1];
    formattedMessages = [
      ...messages.slice(0, -1).map(m => ({ role: m.role, content: m.content })),
      { role: 'user', content: [
        { type: 'image_url', image_url: { url: `data:${imageType || 'image/jpeg'};base64,${imageBase64}` } },
        { type: 'text', text: lastMsg.content || 'Analizá esta imagen.' }
      ]}
    ];
  } else {
    formattedMessages = messages.map(m => ({ role: m.role, content: m.content }));
  }

  const postData = JSON.stringify({
    model: hasImage ? 'meta-llama/llama-4-scout-17b-16e-instruct' : 'llama-3.3-70b-versatile',
    messages: [{ role: 'system', content: system }, ...formattedMessages],
    max_tokens: plan === 'ELITE' ? 2048 : 1024,
    temperature: 0.7
  });

  const req = https.request({
    hostname: 'api.groq.com',
    path: '/openai/v1/chat/completions',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${GROQ_API_KEY}`,
      'Content-Length': Buffer.byteLength(postData)
    }
  }, res => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => { try { callback(null, JSON.parse(data)); } catch(e) { callback(e); } });
  });
  req.on('error', callback);
  req.write(postData);
  req.end();
}

// ── PDF PARSER ────────────────────────────────────────
async function parsePDF(base64Data) {
  try {
    const pdfParse = require('pdf-parse');
    const data = await pdfParse(Buffer.from(base64Data, 'base64'));
    return data.text.substring(0, 8000);
  } catch(e) { return null; }
}

// ── REPLICATE ─────────────────────────────────────────
function replicateRequest(path, method, body, callback) {
  const postData = body ? JSON.stringify(body) : null;
  const req = https.request({
    hostname: 'api.replicate.com',
    path, method,
    headers: {
      'Authorization': `Bearer ${REPLICATE_API_KEY}`,
      'Content-Type': 'application/json',
      ...(postData && { 'Content-Length': Buffer.byteLength(postData) })
    }
  }, res => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => { try { callback(null, JSON.parse(data)); } catch(e) { callback(e); } });
  });
  req.on('error', callback);
  if (postData) req.write(postData);
  req.end();
}

function downloadImage(url, callback) {
  https.get(url, res => {
    if (res.statusCode === 301 || res.statusCode === 302) { downloadImage(res.headers.location, callback); return; }
    const chunks = [];
    res.on('data', chunk => chunks.push(chunk));
    res.on('end', () => callback(null, Buffer.concat(chunks)));
  }).on('error', callback);
}

function pollReplicate(predictionId, res, attempts) {
  if (attempts > 60) { res.writeHead(500); res.end(JSON.stringify({ error: 'Tiempo agotado' })); return; }
  setTimeout(() => {
    replicateRequest(`/v1/predictions/${predictionId}`, 'GET', null, (err, data) => {
      if (err) { pollReplicate(predictionId, res, attempts + 1); return; }
      if (data.status === 'succeeded') {
        const imageUrl = Array.isArray(data.output) ? data.output[0] : data.output;
        if (!imageUrl) { res.writeHead(500); res.end(JSON.stringify({ error: 'Sin URL' })); return; }
        downloadImage(imageUrl, (err, buffer) => {
          if (err) { res.writeHead(500); res.end(JSON.stringify({ error: 'Error descarga' })); return; }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, imageBase64: buffer.toString('base64') }));
        });
      } else if (data.status === 'failed') {
        res.writeHead(500); res.end(JSON.stringify({ error: data.error || 'Falló' }));
      } else { pollReplicate(predictionId, res, attempts + 1); }
    });
  }, 2000);
}

// ── SERVIDOR ──────────────────────────────────────────
const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  // Health check
  if (req.method === 'GET') {
    res.writeHead(200); res.end('⚡ ZEUS Server activo');
    return;
  }

  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', async () => {
    let parsed;
    try { parsed = JSON.parse(body); }
    catch(e) { res.writeHead(400); res.end(JSON.stringify({ error: 'JSON inválido' })); return; }

    const plan = (parsed.plan || 'FREE').toUpperCase();
    const sessionId = parsed.sessionId || 'unknown';

    // ── VERIFY ADMIN ──────────────────────────────────
    if (req.url === '/verify-admin') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: parsed.password === ADMIN_PASSWORD }));
      return;
    }

    // ── ADMIN: GET ALL CHATS ──────────────────────────
    if (req.url === '/admin/chats') {
      if (parsed.password !== ADMIN_PASSWORD) {
        res.writeHead(401); res.end(JSON.stringify({ error: 'No autorizado' }));
        return;
      }
      supabaseRequest('GET', 'chats?order=updated_at.desc&limit=100', null, (err, data) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, chats: Array.isArray(data) ? data : [] }));
      });
      return;
    }

    // ── ADMIN: GET STATS ──────────────────────────────
    if (req.url === '/admin/stats') {
      if (parsed.password !== ADMIN_PASSWORD) {
        res.writeHead(401); res.end(JSON.stringify({ error: 'No autorizado' }));
        return;
      }
      supabaseRequest('GET', 'stats?order=created_at.desc&limit=500', null, (err, stats) => {
        supabaseRequest('GET', 'chats?select=id,session_id,plan', null, (err2, chats) => {
          const allStats = Array.isArray(stats) ? stats : [];
          const allChats = Array.isArray(chats) ? chats : [];
          const sessions = [...new Set(allChats.map(c => c.session_id))].length;
          const byPlan = {};
          allChats.forEach(c => { byPlan[c.plan] = (byPlan[c.plan] || 0) + 1; });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, totalChats: allChats.length, totalSessions: sessions, byPlan, recentStats: allStats.slice(0, 50) }));
        });
      });
      return;
    }

    // ── ADMIN: DELETE CHAT ────────────────────────────
    if (req.url === '/admin/delete-chat') {
      if (parsed.password !== ADMIN_PASSWORD) {
        res.writeHead(401); res.end(JSON.stringify({ error: 'No autorizado' }));
        return;
      }
      supabaseRequest('DELETE', `chats?id=eq.${parsed.chatId}`, null, () => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      });
      return;
    }

    // ── CHAT ──────────────────────────────────────────
    if (req.url === '/chat') {
      console.log(`💬 Chat [${plan}] - Session: ${sessionId}`);
      let messages = parsed.messages;

      if (parsed.pdfBase64) {
        const pdfText = await parsePDF(parsed.pdfBase64);
        const lastMsg = messages[messages.length - 1];
        messages = [...messages.slice(0, -1), {
          role: 'user',
          content: (lastMsg.content ? lastMsg.content + '\n\n' : '') +
            (pdfText ? `📄 PDF:\n\n${pdfText}\n\nAnalizá este documento.` : '[PDF no legible]')
        }];
      }

      groqRequest(messages, plan, parsed.imageBase64, parsed.imageType, (err, data) => {
        if (err) { res.writeHead(500); res.end(JSON.stringify({ error: err.message })); return; }
        if (data.error) { res.writeHead(400); res.end(JSON.stringify({ error: data.error.message || JSON.stringify(data.error) })); return; }
        const text = data.choices?.[0]?.message?.content || 'No pude responder.';

        // Guardar en Supabase
        if (parsed.chatId) {
          saveChat({
            id: parsed.chatId,
            session_id: sessionId,
            plan,
            messages: parsed.messages,
            preview: parsed.messages.find(m => m.role === 'user')?.content?.substring(0, 100) || 'Chat',
            updated_at: new Date().toISOString()
          });
        }
        saveStat({ session_id: sessionId, event: 'chat', plan });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, text }));
      });
    }

    // ── IMÁGENES ──────────────────────────────────────
    else if (req.url === '/generate-image') {
      const { prompt } = parsed;
      console.log(`🎨 Imagen [${plan}]:`, prompt.substring(0, 50) + '...');
      saveStat({ session_id: sessionId, event: 'image', plan });

      replicateRequest('/v1/predictions', 'POST', {
        version: 'black-forest-labs/flux-schnell',
        input: { prompt, num_outputs: 1, aspect_ratio: '1:1', output_format: 'jpg', output_quality: 90, num_inference_steps: 4 }
      }, (err, data) => {
        if (err) { res.writeHead(500); res.end(JSON.stringify({ error: err.message })); return; }
        if (data.error) { res.writeHead(400); res.end(JSON.stringify({ error: data.error })); return; }
        if (!data.id) { res.writeHead(500); res.end(JSON.stringify({ error: 'Sin prediction ID' })); return; }
        pollReplicate(data.id, res, 0);
      });
    }

    else { res.writeHead(404); res.end(JSON.stringify({ error: 'Ruta no encontrada' })); }
  });
});

server.listen(PORT, () => {
  console.log('');
  console.log('⚡ ========================================');
  console.log(`   ZEUS Server corriendo en puerto ${PORT}`);
  console.log('   Chat: Groq | Imágenes: Replicate');
  console.log('   Base de datos: Supabase');
  console.log('⚡ ========================================');
  console.log('');
});
