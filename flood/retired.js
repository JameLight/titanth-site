'use strict';
// Update the prior flood worker when this device returns online. No user records are removed.
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/flood/sw.js', {scope:'/flood/',updateViaCache:'none'}).then(r=>r.update()).catch(()=>{});
