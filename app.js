// app.js - VERSION FUNCIONAL ESTABLE (DIAGNÓSTICO FINAL SIN RECAPTCHA)

const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const io = require('socket.io')(server);

// ----------------------------------------------------
// VARIABLES VITALES
// ----------------------------------------------------
const PORT = process.env.PORT || 3000;
// const RECAPTCHA_SECRET = process.env.RECAPTCHA_SECRET; // DESACTIVADO para diagnóstico

// Envía el archivo index.html
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

// LÓGICA DE USUARIOS Y CHAT
let usernames = {};
let numUsers = 0;  

io.on('connection', (socket) => {
    let addedUser = false;

    // FUNCIÓN PRINCIPAL DE LOGIN (SOLO VERIFICACIÓN DE NOMBRE)
    socket.on('add user', (data) => {
        if (addedUser) return;
       
        const { username } = data; // Solo usamos el nombre

        // 1. INICIO DE SESIÓN ESTÁNDAR
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
   
    // LÓGICA DE CHAT: PERMITE CHATEAR
    socket.on('chat message', (data) => {
        if (!socket.username) return;
       
        // No hay bloqueo de reCAPTCHA aquí
       
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