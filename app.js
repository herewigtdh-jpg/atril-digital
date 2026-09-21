/* ============ ATRIL DIGITAL v2.0 - Aula con video en vivo ============ */
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);

  class Atril {
    constructor() {
      this.db = null; this.auth = null; this.usuario = null;
      this.modoDemo = !!window.MODO_DEMO;
      this.room = null;
      this.tiempoTranscurrido = 0; this.auditores = 0;
      this.cacheElementos();
      this.enlazarEventos();
      this.iniciarReloj();
      if (this.modoDemo) { this.iniciarDemo(); } else { this.iniciarMotor(); }
    }

    cacheElementos() {
      this.chat = $('chatContainer'); this.form = $('formInterpelacion');
      this.input = $('inputInterpelacion'); this.contador = $('contadorAuditores');
      this.tiempo = $('tiempoSesion'); this.toasts = $('toastContainer');
      this.docente = $('nombreDocente'); this.termino = $('terminoDestacado');
      this.userInfo = $('userInfo'); this.btnLogin = $('btnLogin'); this.btnRegistro = $('btnRegistro');
      this.modal = $('modalAuth'); this.formAuth = $('formAuth'); this.modalError = $('modalError');
      this.campoNombre = $('campoNombre'); this.campoEmail = $('campoEmail');
      this.campoPassword = $('campoPassword'); this.btnSubmit = $('btnSubmitAuth');
    }

    enlazarEventos() {
      this.form.addEventListener('submit', (e) => { e.preventDefault(); this.enviarInterpelacion(); });
      $('btnRefrendar').addEventListener('click', () => this.refrendar());
      $('btnDesconectar').addEventListener('click', () => this.desconectar());
      document.querySelectorAll('.btn-reaccion').forEach(b =>
        b.addEventListener('click', () => this.reaccion(b.dataset.reaccion)));
      document.querySelectorAll('.btn-nav[data-seccion]').forEach(b =>
        b.addEventListener('click', (e) => {
          document.querySelectorAll('.btn-nav[data-seccion]').forEach(x => x.classList.remove('activo'));
          e.currentTarget.classList.add('activo');
        }));
      this.btnLogin.addEventListener('click', () => this.abrirModal('ingreso'));
      this.btnRegistro.addEventListener('click', () => this.abrirModal('registro'));
      $('btnCerrarModal').addEventListener('click', () => this.cerrarModal());
      this.formAuth.addEventListener('submit', (e) => { e.preventDefault(); this.procesarAuth(); });
      $('btnGoogle').addEventListener('click', () => this.authGoogle());
    }

    iniciarMotor() {
      try {
        firebase.initializeApp(window.FIREBASE_CONFIG);
        this.auth = firebase.auth();
        this.db = firebase.firestore();
        this.auth.onAuthStateChanged(u => { this.usuario = u; this.pintarAuth(); });
        this.escucharChat();
        this.escucharSesion();
        this.toast('Motor de datos vinculado. Operación homologada.');
      } catch (err) {
        console.error(err);
        this.toast('Anomalía detectada al vincular el motor de datos.');
      }
    }

    escucharChat() {
      this.db.collection('interpelaciones')
        .orderBy('timestamp', 'asc').limitToLast(50)
        .onSnapshot(snap => {
          this.chat.innerHTML = '';
          this.mensajeSistema('Bienvenido al Atril Digital. Formule sus interpelaciones con precisión.');
          snap.forEach(d => {
            const m = d.data();
            this.mensajeChat(m.nombreAutor || 'Aprendiz', m.texto, m.timestamp && m.timestamp.toDate());
          });
        }, err => {
          console.warn(err);
          this.mensajeSistema('El motor de datos está en espera. Verifique Firestore.');
        });
    }

    escucharSesion() {
      this.db.collection('sesiones').doc('activa').onSnapshot(d => {
        if (!d.exists) { this.desconectarVideo(); return; }
        const s = d.data();
        if (s.docente) this.docente.textContent = s.docente;
        if (s.terminoMomento) {
          this.termino.textContent = s.terminoMomento;
          if (this._ultTermino !== s.terminoMomento) { this._ultTermino = s.terminoMomento; this.sembrarTermino(s.terminoMomento); }
        }
        if (s.activa) { this.conectarVideo(s); } else { this.desconectarVideo(); }
      }, () => {});
    }

    /* ---------- VIDEO EN VIVO (LiveKit) ---------- */
    async conectarVideo(sesion) {
      if (this.room || !window.LivekitClient) return;this.overlayConectando();
      const identidad = this.usuario ? this.usuario.uid : 'invitado-' + Date.now();
      const nombre = this.usuario ? (this.usuario.displayName || this.usuario.email) : 'Aprendiz';
      try {
        const resp = await fetch('/api/token?room=' +
          encodeURIComponent(sesion.sala || 'atril-sala-principal') +
          '&identity=' + encodeURIComponent(identidad) +
          '&name=' + encodeURIComponent(nombre) + '&publish=0');
        const data = await resp.json();
        if (!data.token) throw new Error('sin token');
        const LK = window.LivekitClient;
        this.room = new LK.Room({ adaptiveStream: true, dynacast: true });
        this.room.on(LK.RoomEvent.TrackSubscribed, (track, pub, part) => this.adjuntarTrack(track, part));
        this.room.on(LK.RoomEvent.TrackUnsubscribed, (track) => track.detach());
        this.room.on(LK.RoomEvent.Disconnected, () => { this.room = null; this.mostrarOverlay(); });
        await this.room.connect(data.url, data.token);
        this.room.localParticipant.setMicrophoneEnabled(false);
        this.escucharSenalesDocente();
        this.ocultarOverlay();
        this.toast('Enlace de video establecido con el atril.');
      } catch (err) {
        console.error(err);
        this.toast('Anomalía al establecer el video: ' + (err.message || err));
      }
    }

    adjuntarTrack(track, part) {
      const visor = $('videoContainer');
      if (track.kind === 'video') {
        let el = $('videoRemoto');
        if (!el) {
          el = document.createElement('video');
          el.id = 'videoRemoto'; el.autoplay = true; el.playsInline = true;
          visor.appendChild(el);
        }
        track.attach(el);
      } else {
        const a = track.attach();
        a.id = 'audioRemoto';
        document.body.appendChild(a);
      }
    }

    desconectarVideo() {
      if (this._senalInterval) { clearInterval(this._senalInterval); this._senalInterval = null; }
      if (this.room) { this.room.disconnect(); this.room = null; }
      const v = $('videoRemoto'); if (v) v.remove();
      const a = $('audioRemoto'); if (a) a.remove();
      this.mostrarOverlay();
    }
        escucharVademecum() {
      if (this._vadeSub) { this._vadeSub(); this._vadeSub = null; }
      if (!this.usuario) { this.renderVademecum({}); return; }
      this._vadeSub = this.db.collection('vademecum').doc(this.usuario.uid).onSnapshot(d => {
        this.renderVademecum(d.exists ? (d.data().terminos || {}) : {});
      }, () => {});
    }
    renderVademecum(terminos) {
      const cont = $('listaVademecum'); if (!cont) return;
      cont.innerHTML = '';
      const claves = Object.keys(terminos);
      if (!claves.length) { cont.innerHTML = '<p class="descripcion-progreso">Aún no hay términos: cuando el docente fije el Término del Momento, aparecerá aquí.</p>'; return; }
      claves.forEach(t => {
        const chip = document.createElement('button');
        chip.className = 'chip-termino';
        chip.dataset.estado = terminos[t];
        chip.textContent = t + ' · ' + terminos[t];
        chip.title = 'Clic para avanzar de estado';
        chip.addEventListener('click', () => this.avanzarTermino(t, terminos[t]));
        cont.appendChild(chip);
      });
    }
    avanzarTermino(t, estado) {
      if (!this.usuario) return;
      const orden = { adquisicion: 'consolidacion', consolidacion: 'dominio', dominio: 'dominio' };
      const sig = orden[estado] || 'consolidacion';
      if (sig === estado) { this.toast('Este término ya está en Dominio consolidado. 🏅'); return; }
      const pts = sig === 'consolidacion' ? 5 : 10;
      this.db.collection('vademecum').doc(this.usuario.uid).set({
        ['terminos.' + t]: sig,
        puntos: firebase.firestore.FieldValue.increment(pts)
      }, { merge: true }).then(() => {
        this.toast(sig === 'dominio' ? '🏅 Ceremonia de Dominio consolidado: ' + t : '➡️ ' + t + ' pasa a Consolidación (+' + pts + ' puntos)');
      }).catch(() => this.toast('Anomalía al avanzar el término.'));
    }
    sembrarTermino(t) {
      if (!this.usuario || !t) return;
      this.db.collection('vademecum').doc(this.usuario.uid).set({ ['terminos.' + t]: 'adquisicion' }, { merge: true }).catch(() => {});
    } 
        escucharSenalesDocente() {
      // Limpiar intervalo anterior si existe
      if (this._senalInterval) { clearInterval(this._senalInterval); this._senalInterval = null; }
      if (!this.usuario || !this.room) return;
      
      // Polling cada 3 segundos (no onSnapshot)
      this._senalInterval = setInterval(async () => {
        try {
          const doc = await this.db.collection('senales').doc(this.usuario.uid).get();
          if (!doc.exists) return;
          const s = doc.data();
          
          // Solo procesar si no está marcada como procesada
          if (s.hablar && s.procesada !== true) {
            this.toast('🎤 El docente le da la palabra. Hable ahora.');
            await this.room.localParticipant.setMicrophoneEnabled(true);
            
            // Marcar como procesada INMEDIATAMENTE
            await this.db.collection('senales').doc(this.usuario.uid).update({
              procesada: true,
              procesadaEn: firebase.firestore.FieldValue.serverTimestamp()
            });
            
            // Borrar después de 8 segundos (tiempo suficiente para que el alumno hable)
            setTimeout(() => {
              this.db.collection('senales').doc(this.usuario.uid).delete().catch(() => {});
              // Apagar micrófono automáticamente
              if (this.room) {
                this.room.localParticipant.setMicrophoneEnabled(false);
                this.toast('Micrófono cerrado. Espere la siguiente señal del docente.');
              }
            }, 8000);
          }
        } catch (err) {
          console.warn('Error al revisar señales:', err);
        }
      }, 3000); // Cada 3 segundos
    }
       mostrarOverlay() { this.overlayEspera(); }
    overlayEspera() {
      const o = document.querySelector('.overlay-video'); if (!o) return;
      o.style.display = 'flex';
      const m = $('mensajeOverlay'); if (m) m.textContent = 'El aula está en espera: se abrirá en vivo cuando el docente inicie la sesión de inmersión.';
      const n = $('notaOverlay'); if (n) n.textContent = 'Docente: Herewig, el Mago del Inglés';
      const l = $('loaderOverlay'); if (l) l.hidden = true;
    }
    overlayConectando() {
      const o = document.querySelector('.overlay-video'); if (!o) return;
      o.style.display = 'flex';
      const m = $('mensajeOverlay'); if (m) m.textContent = 'Estableciendo enlace con el Docente Nativo…';
      const l = $('loaderOverlay'); if (l) l.hidden = false;
    }
    ocultarOverlay() { const o = document.querySelector('.overlay-video'); if (o) o.style.display = 'none'; }

    /* ---------- Interpelaciones ---------- */
    enviarInterpelacion() {
      const texto = this.input.value.trim();
      if (!texto) return;
      if (this.modoDemo) { this.mensajeChat('Aprendiz (demo)', texto, new Date()); this.input.value = ''; return; }
      if (!this.usuario) { this.toast('Requisito vinculante: autentifíquese para interpelar.'); this.abrirModal('ingreso'); return; }
      this.db.collection('interpelaciones').add({
        autor: this.usuario.uid,
        nombreAutor: this.usuario.displayName || this.usuario.email,
        texto: texto,
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
      }).then(() => { this.input.value = ''; this.toast('Interpelación transmitida al atril.'); })
        .catch(err => { console.error(err); this.toast('Anomalía detectada al transmitir.'); });
    }

    /* ---------- Autenticación ---------- */
    abrirModal(modo) {
      if (this.modoDemo) { this.toast('La autenticación se activa al configurar Firebase.'); return; }
      this.modoAuth = modo;
      $('tituloModal').textContent = (modo === 'registro') ? 'Registro de Aprendiz' : 'Acceso al Atril';
      this.campoNombre.hidden = (modo !== 'registro');
      this.btnSubmit.textContent = (modo === 'registro') ? 'Consolidar Registro' : 'Ingresar';
      this.modalError.textContent = '';
      this.modal.hidden = false;
      this.campoEmail.focus();
    }
    cerrarModal() { this.modal.hidden = true; }

    procesarAuth() {
      const email = this.campoEmail.value.trim();
      const pass = this.campoPassword.value;
      const nombre = this.campoNombre.value.trim();
      this.modalError.textContent = '';
      if (this.modoAuth === 'registro') {
        this.auth.createUserWithEmailAndPassword(email, pass)
          .then(cred => cred.user.updateProfile({ displayName: nombre || null })
            .then(() => this.db.collection('usuarios').doc(cred.user.uid).set({
              nombre: nombre || email, email: email, rol: 'aprendiz',
              fechaRegistro: firebase.firestore.FieldValue.serverTimestamp()
            })))
          .then(() => { this.cerrarModal(); this.toast('Registro homologado. Bienvenido al Atril.'); })
          .catch(err => { this.modalError.textContent = this.traducir(err.code); });
      } else {
        this.auth.signInWithEmailAndPassword(email, pass)
          .then(() => { this.cerrarModal(); this.toast('Sesión iniciada correctamente.'); })
          .catch(err => { this.modalError.textContent = this.traducir(err.code); });
      }
    }

    authGoogle() {
      const prov = new firebase.auth.GoogleAuthProvider();
      this.auth.signInWithPopup(prov)
        .then(() => { this.cerrarModal(); this.toast('Sesión homologada con Google.'); })
        .catch(err => { this.modalError.textContent = this.traducir(err.code); });
    }

    pintarAuth() {
      this.userInfo.innerHTML = '';
      if (this.usuario) {
        this.btnLogin.hidden = true; this.btnRegistro.hidden = true; this.userInfo.hidden = false;
        const span = document.createElement('span');
        span.className = 'nombre-usuario';
        span.textContent = this.usuario.displayName || this.usuario.email;
        const btn = document.createElement('button');
        btn.className = 'btn-secundario btn-sm';
        btn.textContent = 'Desvincular';
        btn.addEventListener('click', () => this.auth.signOut());
        this.userInfo.append(span, btn);
        this.escucharVademecum();
      } else {
        this.btnLogin.hidden = false; this.btnRegistro.hidden = false; this.userInfo.hidden = true;
      }
    }

    traducir(code) {
      const map = {
        'auth/email-already-in-use': 'El correo ya está vinculado a una cuenta existente.',
        'auth/invalid-email': 'Formato de correo inconsistente.',
        'auth/weak-password': 'La contraseña requiere mínimo 6 caracteres.',
        'auth/user-not-found': 'No existe cuenta con estas credenciales.',
        'auth/wrong-password': 'Contraseña incorrecta.',
        'auth/invalid-credential': 'Credenciales inconsistentes.',
        'auth/popup-closed-by-user': 'Ventana de acceso cerrada antes de concluir.'
      };
      return map[code] || 'Anomalía detectada en la autenticación.';
    }

    /* ---------- Progreso y sesión ---------- */
    refrendar() {
      if (this.modoDemo) { this.toast('Operación homologada (demo). Avance diligenciado.'); return; }
      if (!this.usuario) { this.toast('Requisito vinculante: autentifíquese para refrendar.'); this.abrirModal('ingreso'); return; }
      this.db.collection('progreso').doc(this.usuario.uid).set({
        ultimaActividad: firebase.firestore.FieldValue.serverTimestamp(),
        segundos: firebase.firestore.FieldValue.increment(this.tiempoTranscurrido)
      }, { merge: true })
        .then(() => this.toast('Operación homologada. Avance diligenciado en su vademécum.'))
        .catch(() => this.toast('Anomalía detectada al refrendar.'));
    }

    desconectar() {
      if (confirm('¿Confirma su desvinculación de la sesión en curso?')) {
        const fin = () => { this.toast('Desconexión procesada.'); setTimeout(() => location.reload(), 1200); };
        if (this.usuario) { this.auth.signOut().then(fin); } else { fin(); }
      }
    }

    reaccion(tipo) {
      const emojis = { aplausos: '👏', duda: '❓', interes: '💡', acuerdo: '✓' };
      this.mensajeChat('Sistema', 'Reacción transmitida: ' + emojis[tipo], new Date());
      if (!this.modoDemo && this.usuario) {
        this.db.collection('reacciones').add({
          usuario: this.usuario.uid, tipo: tipo,
          timestamp: firebase.firestore.FieldValue.serverTimestamp()
        }).catch(() => {});
      }
      this.toast('Reacción "' + tipo + '" transmitida al atril.');
    }

    /* ---------- Demo y utilidades ---------- */
    iniciarDemo() {
      this.auditores = 7;
      this.contador.textContent = this.auditores;
      setInterval(() => { this.auditores += Math.floor(Math.random() * 3); this.contador.textContent = this.auditores; }, 5000);
      this.mensajeSistema('Modo demostración activo: configure Firebase para el motor real.');
    }

    iniciarReloj() {
      setInterval(() => {
        this.tiempoTranscurrido++;
        const h = String(Math.floor(this.tiempoTranscurrido / 3600)).padStart(2, '0');
        const m = String(Math.floor((this.tiempoTranscurrido % 3600) / 60)).padStart(2, '0');
        const s = String(this.tiempoTranscurrido % 60).padStart(2, '0');
        this.tiempo.textContent = h + ':' + m + ':' + s;
      }, 1000);
    }

    mensajeChat(autor, texto, fecha) {
      const div = document.createElement('div');
      div.className = 'mensaje-chat';
      const hora = fecha ? fecha.toLocaleTimeString() : new Date().toLocaleTimeString();
      div.innerHTML = '<strong></strong> <span class="cuerpo"></span><span class="timestamp"></span>';
      div.querySelector('strong').textContent = autor + ':';
      div.querySelector('.cuerpo').textContent = texto;
      div.querySelector('.timestamp').textContent = hora;
      this.chat.appendChild(div);
      this.chat.scrollTop = this.chat.scrollHeight;
    }

    mensajeSistema(texto) {
      const div = document.createElement('div');
      div.className = 'mensaje-sistema';
      const emoji = document.createElement('span'); emoji.textContent = '💡';
      const p = document.createElement('p'); p.textContent = texto;
      div.append(emoji, p);
      this.chat.appendChild(div);
    }

    toast(mensaje) {
      const t = document.createElement('div');
      t.className = 'toast';
      t.textContent = mensaje;
      this.toasts.appendChild(t);
      setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 300); }, 4000);
    }
  }

  document.addEventListener('DOMContentLoaded', () => { window.ATRIL = new Atril(); });
})();
