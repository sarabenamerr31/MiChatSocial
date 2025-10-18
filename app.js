// app.js - SERVIDOR CON RECAPTCHA Y CORRECCIÓN DE CONEXIÓN FINAL

const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const io = require('socket.io')(server);
const axios = require('axios');

// ----------------------------------------------------
// VARIABLES VITALES
// ----------------------------------------------------
const PORT = process.env.PORT || 3000;
// IMPORTANTE: Esta clave debe estar configurada en RENDER
const RECAPTCHA_SECRET = process.env.RECAPTCHA_SECRET;
const SCORE_UMBRAL = 0.5;
const USER_VERIFIED = new Set();

// Envía el archivo index.html
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

// LÓGICA DE USUARIOS Y CHAT
let usernames = {};
let numUsers = 0;  

io.on('connection', (socket) => {
    let addedUser = false;

    // FUNCIÓN PRINCIPAL DE LOGIN Y VERIFICACIÓN
    socket.on('add user', async (data) => {
        if (addedUser) return;
       
        const { username, token } = data;
       
        // 1. VERIFICACIÓN DE RECAPTCHA
        try {
            // Verificamos si la clave secreta existe antes de usarla
            if (!RECAPTCHA_SECRET) {
                console.error('ERROR: La clave secreta de reCAPTCHA no está configurada en Render.');
                // Permitimos la entrada pero mostramos un error en el chat
                socket.emit('chat message', { error: 'Alerta: reCAPTCHA no activo. Revisa la clave secreta.' });
            } else {
                const googleUrl = 'https://www.google.com/recaptcha/api/siteverify';
               
                const response = await axios.post(googleUrl, null, {
                    params: { secret: RECAPTCHA_SECRET, response: token }
                });

                const { success, score } = response.data;
          
                if (!success || score < SCORE_UMBRAL) {
                    console.warn(`[SEGURIDAD] Bloqueo de mensaje por bot. Score: ${score}`);
                    // Si falla la verificación, NO permitimos el login
                    return socket.emit('login error', `Verificación de seguridad fallida. Score bajo. (${score})`);
                }
               
                // Si es exitoso, marcamos al usuario como verificado
                USER_VERIFIED.add(socket.id);
            }

        } catch (error) {
            console.error('Error al verificar reCAPTCHA:', error.message);
            return socket.emit('login error', 'Error interno de verificación. No podrás chatear.');
        }
       
        // 2. INICIO DE SESIÓN ESTÁNDAR
        if (usernames[username]) {
             return socket.emit('login error', 'El nombre de usuario ya está en uso.');
        }

        socket.username = username;
        usernames[username] = socket.id;
        ++numUsers;
        addedUser = true;

        socket.emit('login', {
            numUsers: numUsers,
            users: Object.keys(usernames)
        });

        socket.broadcast.emit('user joined', {
            username: socket.username,
            numUsers: numUsers,
            users: Object.keys(usernames)
        });
    });
   
    // LÓGICA DE CHAT: BLOQUEAR SI NO ESTÁ VERIFICADO
    socket.on('chat message', (data) => {
        // Solo bloqueamos si la clave secreta existe y el usuario no está verificado
        if (RECAPTCHA_SECRET && !USER_VERIFIED.has(socket.id)) {
            return socket.emit('chat message', { error: 'Debes pasar la verificación reCAPTCHA para chatear.' });
        }
       
        // Lógica de mensajes y DM...
        let fullMessage = socket.username + ': ' + data.msg;
        if (data.recipient && data.recipient !== 'general') {
            let recipientId = usernames[data.recipient];
            let senderId = socket.id;
            if (recipientId) {
                io.to(recipientId).emit('private message', { msg: `(DM de ${socket.username}): ${data.msg}`, sender: socket.username });
                io.to(senderId).emit('private message', { msg: `(DM para ${data.recipient}): ${data.msg}`, sender: socket.username });
            } else {
                socket.emit('chat message', {error: 'Usuario desconectado.'});
            }
        } else {
            io.emit('chat message', fullMessage);
        }
    });

    socket.on('disconnect', () => {
        if (addedUser) {
            USER_VERIFIED.delete(socket.id);
            delete usernames[socket.username];
            --numUsers;
            socket.broadcast.emit('user left', {
                username: socket.username,
                numUsers: numUsers,
                users: Object.keys(usernames)
            });
        }
    });
});

// ARREGLO FINAL DEL PUERTO
server.listen(PORT, () => {
  console.log(`Servidor corriendo en el puerto: ${PORT}`);
});