const bus = require('../events/eventBus.js');
const Events = require('../events/eventsNames.js');
const EmailUtils = require('../utils/emailUtils.js');

class NotificationService{
    constructor(pushAdapter){
        this.push = pushAdapter;
        this.enableEmail = process.env.ENABLE_EMAIL_NOTIFICATIONS === 'true';
        this.enablePush = process.env.ENABLE_PUSH_NOTIFICATIONS === 'true';

        this.registerListeners();
    }

    registerListeners = ()=>{
        bus.on(Events.USER_REGISTERED, ({userId, email, username})=>{
            if(this.enablePush) this.push?.pushToUser(userId, 'welcome', {message: `Welcome ${username}!`});
        });

        bus.on(Events.USER_EMAIL_VERIFIED, ({userId, email})=>{
            if(this.enablePush) this.push?.pushToUser(userId, 'email_verified', {email});
        });

        bus.on(Events.USER_LOGIN, ({userId})=>{
            if(this.enablePush) this.push?.pushToUser(userId, 'login', {message: 'Login successful'});
        });

        bus.on(Events.USER_PROFILE_UPDATED, ({userId, changed})=>{
            if(this.enablePush) this.push?.pushToUser(userId, 'profile_updated', { changed });
        });

        bus.on(Events.PASSWORD_RESET_REQUESTED, ({ userId, email })=>{
            if(this.enablePush) this.push?.pushToUser(userId, 'password_reset_requested', { email });
        });

        bus.on(Events.PASSWORD_CHANGED, ({ userId })=>{
            if(this.enablePush) this.push?.pushToUser(userId, 'password_changed', { message: 'Password updated' });
        });
    }
}

module.exports = NotificationService;