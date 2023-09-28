/*Loding configurations*/
const fsmm = require('fs');
const data = fsmm.readFileSync('config-system.json','utf8');
const sys1 = JSON.parse(data).charger_sys[0]
const sys2 = JSON.parse(data).charger_sys[1]
const sys3 = JSON.parse(data).charger_sys[2]

console.log(JSON.parse(data).charger_sys.length)
for (var i=0;i<JSON.parse(data).charger_sys.length;i++){
	console.log(i)
}
