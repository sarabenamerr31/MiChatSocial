// app.js - SERVIDOR CON FUNCIÓN DE MENSAJES PRIVADOS (DM) Y YOUTUBE

const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const io = require('socket.io')(server);

const PORT = 3000;

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

// LÓGICA DE USUARIOS Y CHAT
let usernames = {}; // Objeto para guardar {nombre: socket.id}
let numUsers = 0;  

io.on('connection', (socket) => {
    let addedUser = false;

    // Almacenamiento del nombre de usuario y lista de usuarios...
    socket.on('add user', (username) => {
        if (addedUser) return;
       
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

    // ===========================================
    // CORRECCIÓN CLAVE: Manejar Mensajes (incluyendo YouTube)
    // ===========================================
    socket.on('chat message', (data) => {
       
        // Si el mensaje es para compartir YouTube
        if (data.msg === 'YouTubeShare' && data.videoId) {
            let youtubeData = {
                videoId: data.videoId,
                sender: socket.username
            };
           
            // Reenviamos el OBJETO de YouTube a todos los usuarios
            io.emit('chat message', youtubeData);
            return; // Detenemos la función aquí
        }

        let fullMessage = socket.username + ': ' + data.msg;

        if (data.recipient && data.recipient !== 'general') {
            // MENSAJE PRIVADO (DM)
            let recipientId = usernames[data.recipient];
            let senderId = socket.id;

            if (recipientId) {
                // Enviamos el mensaje al RECEPTOR
                io.to(recipientId).emit('private message', {
                    msg: `(DM de ${socket.username}): ${data.msg}`,
                    sender: socket.username
                });
               
                // Enviamos una copia al EMISOR (para que vea que se envió)
                io.to(senderId).emit('private message', {
                    msg: `(DM para ${data.recipient}): ${data.msg}`,
                    sender: socket.username
                });
            } else {
                socket.emit('chat message', '*** Error: Usuario desconectado o nombre incorrecto. ***');
            }
        } else {
            // MENSAJE PÚBLICO
            io.emit('chat message', fullMessage);
        }
    });

    // Desconexión
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

server.listen(PORT, () => {
  console.log(`Servidor corriendo en: http://localhost:${PORT}`);
});