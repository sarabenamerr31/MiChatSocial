// app.js - VERSIÓN FINAL CON RECAPTCHA (ESTABLE)

const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const io = require('socket.io')(server); 
const axios = require('axios'); // Asegúrate de tener 'npm install axios' ejecutado

// ----------------------------------------------------
// VARIABLES VITALES 
// ----------------------------------------------------
const PORT = process.env.PORT || 3000; 
const RECAPTCHA_SECRET = process.env.RECAPTCHA_SECRET; // Clave secreta de Render
const SCORE_UMBRAL = 0.5; // Puntuación mínima de seguridad (ajustable)

let usernames = {}; 
let numUsers = 0; 
const USER_VERIFIED = new Set(); 

// Envía el archivo index.html
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

io.on('connection', (socket) => {
    let addedUser = false; 

    // FUNCIÓN PRINCIPAL DE LOGIN Y VERIFICACIÓN
    socket.on('add user', async (data) => {
        if (addedUser) return;
        
        const { username, token } = data; // Recibe el token de seguridad
        
        // 1. VERIFICACIÓN DE RECAPTCHA 
        try {
            if (!RECAPTCHA_SECRET) {
                console.error('ERROR: La clave secreta de reCAPTCHA no está configurada en Render.');
                return socket.emit('login error', 'Error de seguridad: Clave secreta del servidor no configurada.');
            } 
            
            const googleUrl = 'https://www.google.com/recaptcha/api/siteverify';
            
            const response = await axios.post(googleUrl, null, {
                params: { secret: RECAPTCHA_SECRET, response: token }
            });

            const { success, score } = response.data;
       
            if (!success || score < SCORE_UMBRAL) {
                console.warn(`[SEGURIDAD] Bloqueo de login. Usuario: ${username}, Score: ${score}`);
                return socket.emit('login error', `Verificación de seguridad fallida. Score bajo. (${score.toFixed(2)})`);
            }
            
            USER_VERIFIED.add(socket.id); 

        } catch (error) {
            console.error('Error al verificar reCAPTCHA:', error.message);
            return socket.emit('login error', 'Error interno de verificación.');
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

    // LÓGICA DE CHAT: CHAT PÚBLICO Y PRIVADO (DM)
    socket.on('chat message', (data) => {
        if (!socket.username) return; 
        
        let fullMessage = socket.username + ': ' + data.msg;
        
        if (data.recipient && data.recipient !== 'general') {
            // Mensaje privado (DM)
            let recipientId = usernames[data.recipient];
            let senderId = socket.id;
            
            if (recipientId) {
                io.to(recipientId).emit('private message', { msg: `(DM de ${socket.username}): ${data.msg}`, sender: socket.username });
                io.to(senderId).emit('private message', { msg: `(DM para ${data.recipient}): ${data.msg}`, sender: socket.username });
            } else {
                socket.emit('chat message', {error: 'Usuario desconectado.'});
            }
        } else {
            // Mensaje para el chat general
            io.emit('chat message', fullMessage);
        }
    });

    // LÓGICA DE DESCONEXIÓN
    socket.on('disconnect', () => {
        if (addedUser) {
            delete usernames[socket.username]; 
            --numUsers;
            // Avisa a todos de que el usuario se ha ido
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