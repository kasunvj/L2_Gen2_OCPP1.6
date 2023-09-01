/*
This module read the Tap card and return the value as a list
*/
var tapCardNo;

function tapcardNoGet(data){
	try{
		
		tapCardNo = JSON.parse(data.toString('utf8'))["d"];
	}
	catch(error){
		console.log("Try Again");
		return -1;
	}
	return tapCardNo.toString();
};

module.exports = {tapcardNoGet};