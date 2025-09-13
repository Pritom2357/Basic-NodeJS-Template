const {Server} = require('socket.io');
const jwt = require('jsonwebtoken');

const createSocketServer = (httpServer)=>{
    if(process.env.ENABLE_WEBSOCKETS !== 'true'){
        console.log("Websockets disabled");
        return null;
    }

    const io = new Server(httpServer, {
        cors: {origin: '*'}
    });

    const userSockets = new Map();

    io.on('connection', (socket)=>{
        const token = socket.handshake.query?.token;
        let userId = null;

        try {
            if(!token) throw new Error("missing token");
            const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
            userId = decoded.sub || decoded.id;
        } catch (error) {
            socket.emit('auth_error', {
                message: 'invalid token'
            });
            return socket.disconnect();
        }

        if(!userSockets.has(userId)) userSockets.set(userId, new Set());
        userSockets.get(userId).add(socket);
        console.log(userSockets.get(userId));
        

        socket.emit('connected', {
            message: 'Notification ready'
        });

        socket.on('disconnect', ()=>{
            const set = userSockets.get(userId);
            if(set){
                set.delete(socket);
                if(set.size === 0) userSockets.delete(userId);
            }
        });
    });

    const pushToUser = (userId, event, payload)=>{
        const sockets = userSockets.get(userId);
        if(!sockets) return;
        for(const s of sockets){
            s.emit(event, payload);
        }
    }

    return {io, pushToUser};
}

module.exports = createSocketServer;