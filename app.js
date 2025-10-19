// app.js - VERSIÓN FINAL CON RECAPTCHA (MÁXIMA GARANTÍA)

const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const io = require('socket.io')(server); 
const axios = require('axios'); // Necesario para la verificación de Google

// ----------------------------------------------------
// VARIABLES VITALES 
// ----------------------------------------------------
const PORT = process.env.PORT || 3000; 
const RECAPTCHA_SECRET = process.env.RECAPTCHA_SECRET; // Clave secreta de Render
const SCORE_UMBRAL = 0.5; 
const USER_VERIFIED = new Set(); 

let usernames = {}; 
let numUsers = 0;   

// Envía el archivo index.html
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

io.on('connection', (socket) => {
    let addedUser = false; 

    // FUNCIÓN PRINCIPAL DE LOGIN Y VERIFICACIÓN (USANDO ASYNC)
    socket.on('add user', async (data) => {
        if (addedUser) return;
        
        const { username, token } = data;
        
        // 1. VERIFICACIÓN DE RECAPTCHA 
        try {
            if (!RECAPTCHA_SECRET) {
                console.error('ERROR: La clave secreta de reCAPTCHA no está configurada en Render.');
                return socket.emit('login error', 'Error de seguridad: Clave secreta no configurada.');
            } 
            
            const googleUrl = 'https://www.google.com/recaptcha/api/siteverify';
            
            // Verificación asíncrona
            const response = await axios.post(googleUrl, null, {
                params: { secret: RECAPTCHA_SECRET, response: token }
            });

            const { success, score } = response.data;
       
            if (!success || score < SCORE_UMBRAL) {
                console.warn(`[SEGURIDAD] Bloqueo de mensaje. Usuario: ${username}, Score: ${score}`);
                return socket.emit('login error', `Verificación fallida. Score bajo. (${score.toFixed(2)})`);
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

    // LÓGICA DE CHAT: BLOQUEAR SI NO ESTÁ VERIFICADO
    socket.on('chat message', (data) => {
        if (!USER_VERIFIED.has(socket.id)) {
            return socket.emit('chat message', { error: 'Debes pasar la verificación de reCAPTCHA para chatear.' });
        }
        
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

    // LÓGICA DE DESCONEXIÓN
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
