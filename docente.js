/* ============ CABINA DEL DOCENTE v1.0 ============ */
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  firebase.initializeApp(window.FIREBASE_CONFIG);
  const auth = firebase.auth();
  const db = firebase.firestore();
  let room = null;

  const toast = (m) => {
    const t = document.createElement('div');
    t.className = 'toast'; t.textContent = m;
    $('toastContainer').appendChild(t);
    setTimeout(() => t.remove(), 4000);
  };

  auth.onAuthStateChanged(async (user) => {
    if (!user) { $('zonaAcceso').hidden = false; $('zonaCabina').hidden = true; return; }
    const doc = await db.collection('usuarios').doc(user.uid).get();
    const rol = doc.exists ? doc.data().rol : null;
    if (rol !== 'docente') {
      $('zonaAcceso').hidden = false; $('zonaCabina').hidden = true;
      const nota = $('notaRol');
      nota.hidden = false;
      nota.textContent = 'Sesión de ' + (user.displayName || user.email) +
        '. Esta cabina es para docentes nombrados. Nombramiento: Firebase → Firestore → colección usuarios → este documento → agregar campo "rol" (string) = "docente".';
      return;
    }
    $('zonaAcceso').hidden = true; $('zonaCabina').hidden = false;
    iniciarCabina(user);
  });

  $('formAcceso').addEventListener('submit', (e) => {
    e.preventDefault();
    $('errorAcceso').textContent = '';
    auth.signInWithEmailAndPassword($('emailAcceso').value.trim(), $('passAcceso').value)
      .catch(err => { $('errorAcceso').textContent = 'Credenciales inconsistentes. Verifique.'; });
  });

  function iniciarCabina(user) {
    const nombre = user.displayName || user.email;

    /* Encender cámara y micro + conectar a la sala */
    $('btnCamara').addEventListener('click', async () => {
      try {
        if (room) { toast('La cabina ya está enlazada.'); return; }
        const resp = await fetch('/.netlify/functions/token?room=atril-sala-principal&identity=' +
          encodeURIComponent(user.uid) + '&name=' + encodeURIComponent(nombre));
        const data = await resp.json();
        if (!data.token) throw new Error('sin token');
        const LK = window.LivekitClient;
        room = new LK.Room({ adaptiveStream: true, dynacast: true });
        room.on(LK.RoomEvent.LocalTrackPublished, (pub) => {
          if (pub.track && pub.track.kind === 'video') pub.track.attach($('videoLocal'));
        });
        await room.connect(data.url, data.token);
        await room.localParticipant.setCameraEnabled(true);
        await room.localParticipant.setMicrophoneEnabled(true);
        $('estadoCabina').textContent = 'CABINA ENLAZADA';
        toast('Cabina enlazada a la sala del Atril.');
      } catch (err) {
        console.error(err);
        toast('Anomalía al enlazar la cabina: ' + (err.message || err));
      }
    });

    $('btnMicro').addEventListener('click', async () => {
      if (!room) return;
      const activo = room.localParticipant.isMicrophoneEnabled;
      await room.localParticipant.setMicrophoneEnabled(!activo);
      $('btnMicro').textContent = activo ? 'Activar micrófono' : 'Silenciar micrófono';
    });

    $('btnPantalla').addEventListener('click', async () => {
      if (!room) return;
      const activo = room.localParticipant.isScreenShareEnabled;
      await room.localParticipant.setScreenShareEnabled(!activo);
      toast(activo ? 'Pantalla retirada.' : 'Pantalla compartida con el aula.');
    });

    /* Encender / apagar el EN DIRECTO del aula */
    $('btnIniciar').addEventListener('click', () => {
      db.collection('sesiones').doc('activa').set({
        activa: true,
        docente: nombre,
        sala: 'atril-sala-principal',
        terminoMomento: $('inputTermino').value.trim() || 'Ratificar',
        iniciadaEn: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true }).then(() => {
        $('estadoCabina').textContent = 'EN DIRECTO';
        toast('Sesión de inmersión iniciada. El aula está en vivo.');
      });
    });

    $('btnCerrarSesion').addEventListener('click', () => {
      db.collection('sesiones').doc('activa').set({ activa: false }, { merge: true }).then(() => {
        if (room) { room.disconnect(); room = null; }
        $('estadoCabina').textContent = 'EN ESPERA';
        toast('Sesión concluida. El aula volvió a espera.');
      });
    });

    /* Término del Momento */
    $('btnTermino').addEventListener('click', () => {
      const v = $('inputTermino').value.trim();
      if (!v) return;
      db.collection('sesiones').doc('activa').set({ terminoMomento: v }, { merge: true })
        .then(() => toast('Término fijado en el aula: ' + v));
    });

    /* Moderación de interpelaciones */
    db.collection('interpelaciones').orderBy('timestamp', 'desc').limit(15)
      .onSnapshot(snap => {
        const lista = $('listaInterpelaciones');
        lista.innerHTML = '';
        snap.forEach(d => {
          const m = d.data();
          const fila = document.createElement('div');
          fila.className = 'fila-interpelacion';
          const txt = document.createElement('span');
          txt.textContent = (m.nombreAutor || 'Aprendiz') + ': ' + m.texto;
          const btn = document.createElement('button');
          btn.className = 'btn-secundario btn-sm';
          btn.textContent = 'Desestimar';
          btn.addEventListener('click', () => d.ref.delete());
          fila.append(txt, btn);
          lista.appendChild(fila);
        });
      }, () => {});
  }
})();
