const {EventEmitter} = require('events');
const bus = new EventEmitter();

bus.setMaxListeners(30);

bus.asyncEmit = async(event, payload)=>{
    console.log("events: " + event);
    
    const listeners = bus.listeners(event);
    
    if(!listeners.length){
        return;
    }

    const promises = listeners.map(fn => {
        try {
            console.log(fn);
            const r = fn(payload);
            return r instanceof Promise ? r: Promise.resolve(r);
        } catch (error) {
            return Promise.reject(error)
        }
    });
    return Promise.allSettled(promises);
}

module.exports = bus;