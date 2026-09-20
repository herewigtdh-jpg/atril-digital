// ============ ATRIL DIGITAL - Portero de llaves LiveKit (Vercel) ============
const crypto = require('crypto');

const b64url = (texto) => Buffer.from(texto).toString('base64url');

function generarToken({ apiKey, apiSecret, identity, name, room, puedePublicar }) {
  const ahora = Math.floor(Date.now() / 1000);
  const encabezado = { alg: 'HS256', typ: 'JWT' };
  const carga = {
    iss: apiKey,
    sub: identity,
    name: name || identity,
    iat: ahora,
    nbf: ahora - 10,
    exp: ahora + 6 * 60 * 60,
    jti: identity + '-' + ahora,
    video: { room: room, roomJoin: true, canPublish: puedePublicar, canSubscribe: true, canPublishData: true }
  };
  const cuerpo = b64url(JSON.stringify(encabezado)) + '.' + b64url(JSON.stringify(carga));
  const firma = crypto.createHmac('sha256', apiSecret).update(cuerpo).digest('base64url');
  return cuerpo + '.' + firma;
}

module.exports = (req, res) => {
  const p = req.query || {};
  const room = p.room || 'atril-sala-principal';
  const identity = p.identity || 'invitado-' + Date.now();
  const name = p.name || identity;
  const puedePublicar = p.publish !== '0';
  const { LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET } = process.env;
  if (!LIVEKIT_URL || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
    res.status(500).json({ error: 'Anomalía: faltan variables de entorno LiveKit.' });
    return;
  }
  const token = generarToken({ apiKey: LIVEKIT_API_KEY, apiSecret: LIVEKIT_API_SECRET, identity, name, room, puedePublicar });
  res.status(200).json({ token, url: LIVEKIT_URL, room });
};
