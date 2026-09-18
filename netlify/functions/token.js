// ============================================
// ATRIL DIGITAL - Portero de llaves LiveKit
// Genera tokens JWT sin dependencias externas (crypto nativo de Node)
// Ruta pública: /.netlify/functions/token
// ============================================

const crypto = require('crypto');

// Convierte a base64url (el alfabeto que usa JWT)
const b64url = (texto) => Buffer.from(texto).toString('base64url');

// Firma un token JWT HS256 con el formato que LiveKit exige
function generarToken({ apiKey, apiSecret, identity, name, room, puedePublicar }) {
  const ahora = Math.floor(Date.now() / 1000);
  const encabezado = { alg: 'HS256', typ: 'JWT' };
  const carga = {
    iss: apiKey,                 // quién firma: su API Key
    sub: identity,               // identidad del participante
    name: name || identity,      // nombre visible en la sala
    iat: ahora,
    nbf: ahora - 10,
    exp: ahora + 6 * 60 * 60,    // pase válido por 6 horas
    jti: identity + '-' + ahora,
    video: {
      room: room,
      roomJoin: true,
      canPublish: puedePublicar,
      canSubscribe: true,
      canPublishData: true
    }
  };
  const cuerpo = b64url(JSON.stringify(encabezado)) + '.' + b64url(JSON.stringify(carga));
  const firma = crypto.createHmac('sha256', apiSecret).update(cuerpo).digest('base64url');
  return cuerpo + '.' + firma;
}

exports.handler = async (evento) => {
  const p = evento.queryStringParameters || {};
  const room = p.room || 'atril-sala-principal';
  const identity = p.identity || 'invitado-' + Date.now();
  const name = p.name || identity;
  const puedePublicar = p.publish !== '0';

  const { LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET } = process.env;

  if (!LIVEKIT_URL || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Anomalía: faltan las variables de entorno LiveKit en Netlify.' })
    };
  }

  const token = generarToken({
    apiKey: LIVEKIT_API_KEY,
    apiSecret: LIVEKIT_API_SECRET,
    identity, name, room, puedePublicar
  });

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify({ token, url: LIVEKIT_URL, room })
  };
};
