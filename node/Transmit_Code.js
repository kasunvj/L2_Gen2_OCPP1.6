const { SerialPort } = require('serialport');
const Readline = require('@serialport/parser-readline');
const fs = require('fs');
const readline = require('readline');

const readFilePath = 'Page_Change.txt';
const serialPortPath = '/dev/ttyS2';
const transmissionDelay = 500; // Delay in milliseconds


let lines = []; // Array to store the lines to transmit
let currentIndex = 0; // Index of the current line to transmit
let portOpened = false; // Flag to track whether the port is open


const port = new SerialPort({
  path : serialPortPath,
  baudRate: 9600,
});

// Handle serial port opening
port.on('open', () => {
  console.log(`Serial port ${serialPortPath} opened.`);
  portOpened = true; // Set the flag to true when the port is open

  // Read the file and split it into lines
  fs.readFile(readFilePath, 'utf8', (err, fileContent) => {
    if (err) {
      console.error('Error reading file:', err);
      return;
    }

    // Remove spaces and split the file content into lines
    lines = fileContent.split('\n').map(line => line.replace(/\s+/g, ''));

    // Start sending data when the port is open
    sendData();
  });
});

// Handle errors with the serial port
port.on('error', (err) => {
  console.error('Serial port error:', err);
});

// Function to send data and handle transmission
function sendData() {
  if (currentIndex < lines.length) {
    const line = lines[currentIndex];

    if (line) {
      // Convert the line to a hexadecimal buffer
      const hexLine = line.match(/.{1,2}/g).map(hexPair => '0x' + hexPair);
      const hexBuffer = Buffer.from(hexLine);

      console.log("HEX Buffer is:", hexBuffer);

      // Send the hex buffer through the serial port
      port.write(hexBuffer, (err) => {
        if (err) {
          console.error('Error sending data:', err);
        } else {
          console.log(`Data sent successfully.`);

          // Introduce a delay before processing the next line
          setTimeout(() => {
            currentIndex++; // Move to the next line
            sendData(); // Continue with the next line
          }, transmissionDelay);
        }
      });
    } else {
      // If the line is empty, skip to the next line
      currentIndex++;
      sendData(); // Continue with the next line
    }
  } else {
    // If all lines have been transmitted, close the serial port if it's open
    if (portOpened) {
      port.close((err) => {
        if (err) {
          console.error('Error closing port:', err);
        } else {
          console.log(`Serial port ${serialPortPath} closed.`);
        }
      });
    }
  }
}