// app.js - CÓDIGO BÁSICO Y ESTABLE DEL SERVIDOR

const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const io = require('socket.io')(server); 

// ----------------------------------------------------
// VARIABLES VITALES 
// ----------------------------------------------------
const PORT = process.env.PORT || 3000; 

// 1. Envía el archivo index.html cuando alguien accede a la ruta principal
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

// 2. Lógica de Socket.IO (lo más simple: envía mensajes a todos)
io.on('connection', (socket) => {
    console.log('Un usuario se ha conectado.');
    
    socket.on('chat message', (msg) => {
        io.emit('chat message', msg);
    });

    socket.on('disconnect', () => {
        console.log('Un usuario se ha desconectado.');
    });
});

// 3. El servidor comienza a escuchar en el puerto
server.listen(PORT, () => {
  console.log(`Servidor corriendo en el puerto: ${PORT}`);
});