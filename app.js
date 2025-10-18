// app.js - VERSION FUNCIONAL FINAL (Con lógica de usuarios estable)

const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const io = require('socket.io')(server); 

// ----------------------------------------------------
// VARIABLES VITALES 
// ----------------------------------------------------
const PORT = process.env.PORT || 3000; 
let usernames = {}; 
let numUsers = 0; 

// Envía el archivo index.html
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

io.on('connection', (socket) => {
    let addedUser = false; 

    // FUNCIÓN PRINCIPAL DE LOGIN 
    socket.on('add user', (data) => {
        if (addedUser) return;
        
        const { username } = data; 
        
        // 1. INICIO DE SESIÓN ESTÁNDAR
        if (usernames[username]) { 
             return socket.emit('login error', 'El nombre de usuario ya está en uso.');
        }

        socket.username = username;
        usernames[username] = socket.id;
        ++numUsers;
        addedUser = true;

        // Avisa al usuario que ha entrado y le da la lista de usuarios
        socket.emit('login', {
            numUsers: numUsers,
            users: Object.keys(usernames)
        });

        // Avisa a todos los demás usuarios de que alguien ha entrado
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