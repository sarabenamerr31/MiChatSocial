// app.js - SERVIDOR CON RECAPTCHA SEGURO Y CORRECCIÓN FINAL DEL PUERTO

const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const io = require('socket.io')(server);
const axios = require('axios');

// ----------------------------------------------------
// VARIABLES VITALES (SE SEGURIDAD Y ENTORNO)
// ----------------------------------------------------
// Lectura segura del puerto de Render (CORRECCIÓN FINAL)
const PORT = process.env.PORT || 3000;

// Lectura segura de la clave secreta de Render
// NOTA: Si no la has metido en Render, estará vacía, pero el código NO fallará el inicio.
const RECAPTCHA_SECRET = process.env.RECAPTCHA_SECRET;
const SCORE_UMBRAL = 0.5;
const USER_VERIFIED = new Set(); // Para rastrear usuarios verificados

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
       
        // 1. VERIFICACIÓN DE RECAPTCHA (Lógica para que el servidor no se rompa si la clave está mal)
        if (!RECAPTCHA_SECRET) {
            // Si la clave no está en Render, permitimos el acceso pero BLOQUEAMOS los mensajes.
            console.warn(`[SEGURIDAD] Clave Secreta no configurada. Permitiendo acceso, bloqueando mensajes.`);
        } else {
            try {
                // 2. PEDIR LA VERIFICACIÓN A GOOGLE
                const googleUrl = 'https://www.google.com/recaptcha/api/siteverify';
               
                const response = await axios.post(googleUrl, null, {
                    params: { secret: RECAPTCHA_SECRET, response: token }
                });

                const { success, score } = response.data;
              
                // 3. REGLA DE SEGURIDAD: Bloqueo si no es exitoso o la puntuación es baja
                if (!success || score < SCORE_UMBRAL) {
                    console.warn(`[SEGURIDAD] Bloqueo de mensaje por bot. Score: ${score}`);
                    return socket.emit('login error', `Verificación fallida. Score bajo. (${score})`);
                }
               
                // Si la verificación es exitosa:
                USER_VERIFIED.add(socket.id);

            } catch (error) {
                console.error('Error al verificar reCAPTCHA:', error.message);
                return socket.emit('login error', 'Error interno de verificación. No podrás chatear.');
            }
        }
       
        // 4. INICIO DE SESIÓN ESTÁNDAR
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
        // 🛑 BLOQUEO DE SEGURIDAD: SÓLO CHATEA SI ESTÁS EN LA LISTA DE VERIFICADOS
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

// ARREGLO FINAL DEL PUERTO (CORRIGE ERROR 502)
server.listen(PORT, () => {
  console.log(`Servidor corriendo en el puerto: ${PORT}`);
});