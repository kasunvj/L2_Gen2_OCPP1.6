/*
Get the network status 
Input : None
Return : Network availability (1/0) , Network strength
*/

const{exec}=require("child_process");
var start = 75;
var str1 = '';
var str2 = '';
var str3 = '';

var CID = -1;

var qmclicmd1 = "";
var qmclicmd2 = "";
var qmclicmd3 = "";

//var level3 = 0;
var db = 0;

class networkStat{
	constructor(netStrg,netLev){
		this.netStrg = netStrg;
		this.netLev = netLev;
	}
	getNetStrg(){
		return netStrg;
	}
	
	getNetLev(){
		return netLev;
	}
}

var myNetStat = new networkStat(0,1);



function netwrokStatusGet(){
	require('dns').resolve('google.com', function(err) {
		if (err) {
			//console.log("No connection");
			return 0;
			}
		else {
			//console.log("Connected");
			return 1
		}});
	
}

function networkStrengthGet(){
	//acquire Client ID
	qmclicmd1 = "qmicli --device=/dev/cdc-wdm0 --nas-noop --client-no-release-cid | grep 'CID'";
	
	// when a client id is not assigned. this is run only once in thebeging
	if(CID ==-1){
		exec(qmclicmd1, (error, stdout, stderr) => {
				if (error) {console.log(`error: ${error.message}`);
				// the error is most frequently 'ClientIdsExhausted', max CIDs that can generate is 10, so we remove ablout 7 client cids
				return;}
				if (stderr) {console.log(`stderr: ${stderr}`);return;}
				
				str1 = stdout.toString();
				//console.log(str1)
				
				CID = str1.split(":")[1].replace(" '",'').replace("'",'');
				//console.log("Accquired CID: ",CID);
				
				abc(CID);
				
			});
	}
	
	
	else{
		abc(CID);
	}
	
	return myNetStat.netLev;

}

function abc(CIDNo){
		// get signal strength to the accquired client id, and use it over and over
		qmclicmd2 = "qmicli --device=/dev/cdc-wdm0 --nas-get-signal-strength --client-no-release-cid --client-cid="+CIDNo.toString();
		
		exec(qmclicmd2, (error, stdout, stderr) => {
				if (error) {console.log(`error: ${error.message}`);return;}
				if (stderr) {console.log(`stderr: ${stderr}`);return;}
				str2 = stdout.toString();
				//console.log(str2);
				
				str3 = '';
				
			for (let i = start; i < start+4; i++) {
				 str3 = str3.concat(stdout[i].toString());
				}
			//console.log(str3);
				
			if(isNaN(parseInt(str3))){
				myNetStat.netLev = 0;
				//console.log(0);
			}
			else{
				//console.log(parseInt(str3));
				myNetStat.netStrg = parseInt(str3);
				db = -1*myNetStat.netStrg;
				if (db < 55){
					myNetStat.netLev = 3;}
				else if (db >= 55 && db < 65){
					myNetStat.netLev = 2;}
				else {
					myNetStat.netLev = 1;}
			}
		});		
	}


function networkCIDGet(){
	return CID
}

module.exports = {netwrokStatusGet,networkStrengthGet,networkCIDGet}