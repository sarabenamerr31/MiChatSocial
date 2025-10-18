// app.js - SERVIDOR CON RECAPTCHA V3 SEGURO Y COMPLETO

const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const io = require('socket.io')(server);
const axios = require('axios'); // Usaremos axios (más compatible que fetch)

// ----------------------------------------------------
// VARIABLES VITALES (SE SEGURIDAD Y ENTORNO)
// ----------------------------------------------------
const PORT = process.env.PORT || 3000;
// LEEMOS la clave secreta de la Variable de Entorno de Render
const RECAPTCHA_SECRET = process.env.RECAPTCHA_SECRET;
const SCORE_UMBRAL = 0.5; // Umbral de seguridad para reCAPTCHA v3

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
    socket.on('add user', async (usernameData) => {
        if (addedUser) return;
       
        const { username, token } = usernameData; // Cliente envía nombre y token
       
        // 1. COMPROBACIÓN DE SEGURIDAD
        if (!RECAPTCHA_SECRET || !token) {
            return socket.emit('login error', 'Error de configuración o falta de token.');
        }

        try {
            // 2. PEDIR LA VERIFICACIÓN A GOOGLE
            const googleUrl = 'https://www.google.com/recaptcha/api/siteverify';
           
            const response = await axios.post(googleUrl, null, {
                params: {
                    secret: RECAPTCHA_SECRET, // Se lee de Render
                    response: token
                }
            });

            const { success, score } = response.data;
          
            // 3. REGLA DE SEGURIDAD: Bloqueo si no es exitoso o la puntuación es baja
            if (!success || score < SCORE_UMBRAL) {
                console.warn(`[SEGURIDAD] Bloqueo de bot. Score: ${score}`);
                return socket.emit('login error', `Verificación de seguridad fallida. Puntuación: ${score}`);
            }
          
            // 4. VERIFICACIÓN EXITOSA: Iniciar Sesión
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

        } catch (error) {
            console.error('Error al verificar reCAPTCHA:', error.message);
            return socket.emit('login error', 'Error interno del servidor durante la verificación.');
        }
    });
   
    // RESTO DE LA LÓGICA DEL CHAT (MENSAJES PÚBLICOS/PRIVADOS Y DESCONEXIÓN)
    socket.on('chat message', (data) => {
        if (!socket.username) return;
        // Lógica de mensajes y DM... (Mantenemos la funcionalidad que ya creamos)
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

