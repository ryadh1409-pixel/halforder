const {initializeApp, cert} = require('firebase-admin/app');
const {getFirestore} = require('firebase-admin/firestore');
const sa = require(process.env.HOME + '/Downloads/halforfer-firebase-adminsdk-fbsvc-f66e39c08e.json');
initializeApp({credential: cert(sa)});
const db = getFirestore();
const ids = ['dik3oWxEoB4j9eYfz17F','YEN47jLU0rv93ZKKoDHM','GIe6SQEsEUcjxCRw7fYr','IhEEVIZTYptoStT5CWBI'];
(async()=>{
  for(const id of ids){
    try{
      await db.collection('orders').doc(id).update({status:'completed',deliveryStatus:'delivered',earningsRecorded:true,marketplaceArchived:true});
      console.log('✅',id);
    }catch(e){console.error('❌',id,e.message);}
  }
  process.exit(0);
})();
