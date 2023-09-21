/*
TODO: HeartBeatReq combine with ocppError state
*/

const { Machine, createMachine, interpret, assign, actions } = require("xstate");
const { send } = actions;
const WebSocket = require('ws');
const { v4: randomUUID } = require('uuid');
const path = require('path');
const EventEmitter = require('events');
const ocppEventEmitter = new EventEmitter();

const config = require('./config.json');
const { createValidator } = require('./lib/validator');
const { createRPCError } = require('./lib/util');

const { DisplayManager, mcu } = require('./lib/display.js');
const ButtonReader = require('./lib/btn.js');
const CardReader = require('./lib/tap.js');
const LEDReader = require('./lib/led.js');
const cardReader = new CardReader();
const buttonReader = new ButtonReader();
const display = new DisplayManager();
const led = new LEDReader();

const Database = require('./lib/db');
const db = new Database('my_db');

const connectToServer = (context) => new Promise((resolve, reject) => {
  const url = new URL(context.endpoint);
  if (!url.pathname.endsWith('/')) {
     url.pathname += '/';
  };
  url.pathname = path.join(url.pathname, context.protocols[0], context.identity);
  url.username = context.identity;
  url.password = context.password;
  let handlers = {};
  function handle(method, handler) {
    handlers[method] = handler;
  };
  const socket = new WebSocket(url.toString(), context.protocols);

  handle('DataTransfer', async ({ method, params }) => {
      console.log("DataTransfer Request: ", params);
      await db.update('responseBody', { data: JSON.parse(params.data) });
      return {
        status: 'Accepted'
      };
  });

  handle('RemoteStartTransaction', async ({ method, params }) => {
      console.log("RemoteStartTransaction Request: ", params);
      ocppinterpreter.send({ type: 'APPSTART', idTag: params.idTag, connectorId: params.connectorId || 1 });
      return {
          status: 'Accepted'
      };
  });

  handle('RemoteStopTransaction', async ({ method, params }) => {
      console.log("RemoteStartTransaction Request: ", params);
      ocppinterpreter.send({ type: 'APPSTOP', transactionId: params.transactionId });
      return {
          status: 'Accepted'
      };
  });

  handle('UnlockConnector', async ({ method, params }) => {
      console.log("UnlockConnector Request: ", params);
      return {
          status: 'Accepted'
      };
  });

  handle('Reset', async ({ method, params }) => {
      // Stop transaction when it is and then reboot the system
      console.log("Reset Request: ", params);
      return {
          status: 'Accepted'
      };
  });

  handle('ClearCache', async ({ method, params }) => {
      // Remove database
      console.log("ClearCache Request: ", params);
      return {
          status: 'Accepted'
      };
  });

  handle('ChangeConfiguration', async ({ method, params }) => {
      // Remove database
      console.log("ChangeConfiguration Request: ", params);
      // Update the configuration based on the received parameters
      if (config.hasOwnProperty(params.key)) {
        config[params.key] = typeof config[params.key] === 'number' ? parseInt(params.value) : params.value;

        // Write the updated configuration back to the config.json file
        fs.writeFileSync(path.resolve(__dirname, 'config.json'), JSON.stringify(config, null, 2));
      }
      return {
          status: 'Accepted'
      };
  });

  function logErr(error, method, messageId) {
    const errorMessage = error.rpcErrorMessage;
    const errorCode = error.rpcErrorCode;
    const errorDetails = error.details;

    // console.log("Error Message:", errorMessage);
    // console.log("Error Code:", errorCode);
    // console.log("Error Details:", errorDetails);

    console.log(`OCCP ${method} Message Validation Error -
      Error Message: ${errorMessage},
      Error Code: ${errorCode},
      Error Details: ${JSON.stringify(errorDetails)}`);

    socket.send(
      JSON.stringify([
        4,
        messageId,
        errorCode,
        errorMessage,
        `{The requested method ${method} is not implemented}`,
      ])
    );
  }

  socket.on('message', async (message) => {
      const [type, messageId, ...rest] = JSON.parse(message);
      const pendingCall = context.pendingCalls.get(messageId);

      if (type === 2) {
        const [method, params] = rest;
        const handler = handlers[method];
        if (handler) {
          try {
            await context.validator.validate(`urn:${method}.req`, params);
            const result = await handler({ method, params });
            console.log(`Charger Sending: ${method}`);
            socket.send(JSON.stringify([3, messageId, result]));
          } catch (error) {
            pendingCall.reject(new Error(`Validation Error For Type 2 ${method} Message`));
            logErr(error, method, messageId);
          }
        } else {
          pendingCall.reject(new Error(`NotImplemented Error For ${method} Message`));
          const error = createRPCError("NotImplemented");
          logErr(error, method, messageId);
        };
      }
      else if (type === 3 || type === 4) {
          const params = rest[0];

          if (pendingCall) {
              const method = pendingCall.method;  // Get the method from the pending call
              if (type === 3) {
                  try {
                      await context.validator.validate(`urn:${method}.conf`, params);
                      pendingCall.resolve(params);
                  } catch (error) {
                      // console.log(`Validation Error For Type 3 ${method} Message`);
                      pendingCall.reject(new Error(`Validation Error For Type 3 ${method} Message`));
                      logErr(error, method, messageId);
                  }
              } else if (type === 4) {
                  try {
                      await context.validator.validate(`urn:${method}.conf`, params);
                      pendingCall.resolve(params);
                  } catch (error) {
                      // console.log(`Validation Error For Type 4 ${method} Message:`);
                      pendingCall.reject(new Error(`Validation Error For Type 4 ${method} Message`));
                      logErr(error, method, messageId);
                  }
              }
              context.pendingCalls.delete(messageId);
          }
      }
  });

  socket.on('open', () => resolve(socket));
  // socket.on('error', reject);
  // socket.on('close', () => {
  //   ocppinterpreter.send('DISCONNECT');
  // });
  socket.on('error', (error) => {
    // socket.removeAllListeners();
    ocppinterpreter.send('DISCONNECT');
    reject(new Error(`Connection Error: ${error.message}`));
  });
  socket.on('close', () => {
    // socket.removeAllListeners();
    ocppinterpreter.send('DISCONNECT');
    reject(new Error("Socket was closed"));
  });

  ocppEventEmitter.emit('requestSent');
});

const reconnectToServer = (context, event) => new Promise((resolve, reject) => {
  const interval = setInterval(async () => {
    try {
      const socket = await connectToServer(context);
      let responseBodyDoc = await db.read('responseBody');
      let responseBody = responseBodyDoc.data;

      if (responseBody) {
        responseBody.elapsedTime = context.elapsedTime;

        const messageId = randomUUID();
        const deferredPromise = deferred();
        const method = 'DataTransfer';
        context.pendingCalls.set(messageId, { ...deferredPromise, method });

        console.log('Sending DataTransferReq - Reconnected State');
        socket.send(JSON.stringify([2, messageId, method, {
          vendorId: config.identity,
          data: JSON.stringify(responseBody),
        }]));
      }

      context.socket = socket;
      clearInterval(interval);
      resolve(socket);
    } catch(error) {
      console.log(`Reconnection failed: ${error.message}`);
    }
  }, context.retryInterval);
});

const deferred = () => {
  let resolve, reject;
  let promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { resolve, reject, promise };
};

const logData = (context, event) => {
  console.log('Event data:', event.data);
};

function createOCPPStateMachine(transactionId = 0, elapsedTime = 0, watt = 0, validator) {
  return createMachine({
    id: 'client',
    initial: 'connecting',
    predictableActionArguments: true,
    context: {
        retryInterval: config.retryInterval,
        identity: config.identity,
        password: config.password,
        protocols: config.protocols,
        endpoint: config.endpoint,
        chargePointModel: config.chargePointModel,
        socket: config.socket,
        idTag: config.idTag,
        pendingCalls: new Map(),

        connectorId: 0,
        responseBody: null,

        watt: watt,
        transactionId: transactionId,
        elapsedTime: elapsedTime,
        validator: validator,
    },
    states: {
      connecting: {
        invoke: {
          id: 'connectToServer',
          src: 'connectToServer',
          onDone: {
            target: 'connected',
            actions: assign({
              socket: (context, event) => event.data
            }),
          },
          onError: {
            target: 'disconnected',
            actions: (context, event) => [
              console.log("connecting: ", event.data.message),
            ],
          },
        },
      },

      disconnected: {
        after: {
          5000: 'connecting',
        },
      },

      connected: {
        on: {
          DISCONNECT: 'disconnected',
        },
        invoke: [
          {
            id: 'BootNotificationReq',
            src: 'BootNotificationReq',
            onDone: {
              target: 'createJ1772',
            },
            onError: {
              // target: 'disconnected',
              // actions: (context, event) => [
              //   console.log("connected: ", event.data.message),
              // ],
              target: 'ocppError',
            },
          },
        ]
      },

      ocppError: {
        entry: (context, event) => {
          console.log("OCPP ERROR: ", event.data.message)
        },
        actions: [
          assign({
            transactionId: () => 0,
            elapsedTime: () => 0,
            watt: () => 0,
            responseBody: () => null,
          }),
          async (context, event) => {
            await db.update('transactionId', { data: 0 });
            await db.update('elapsedTime', { data: 0 });
            await db.update('watt', { data: 0 });
            await db.update('responseBody', { data: null });
          },
        ],
      },

      createJ1772: {
        initial: 'Trans',
        states: {
          Trans: {
              always: [
                {
                  target: '#client.createJ1772.MeterValues.checking',
                  actions: [
                    assign({
                      transactionId: (context, event) => context.transactionId,
                    }),
                    async(context) => {
                      // shoud log the trans into log file first
                      let responseBodyDoc = await db.read('responseBody');
                      let responseBody = responseBodyDoc.data;

                      if (responseBody) {
                        responseBody.elapsedTime = context.elapsedTime;

                        console.log('Sending DataTransferReq - Trans State');
                        const messageId = randomUUID();
                        const deferredPromise = deferred();
                        const method = 'DataTransfer';
                        context.pendingCalls.set(messageId, { ...deferredPromise, method });

                        context.socket.send(JSON.stringify([2, messageId, method, {
                          vendorId: config.identity,
                          data: JSON.stringify(responseBody),
                        }]));
                      }
                    }
                  ],
                  cond: (context) => context.transactionId != 0,
                },
                {
                  target: 'Heartbeat.checking'
                },
              ],
          },

          Heartbeat: {
            states: {
              checking: {
                always: [
                  { target: 'connected', cond: (context) => context.socket !== null },
                  { target: 'reconnecting' },
                ]
              },
              reconnecting: {
                invoke: {
                  src: 'reconnectToServer',
                  onDone: {
                    target: 'checking',
                    actions: assign({ socket: (_, event) => event.data }),
                  },
                },
              },
              connected: {
                // activities: ['HeartBeatReq'],
                invoke: [
                  {
                    id: 'HeartBeatReq',
                    src: 'HeartBeatReq',
                  },
                ],
                on: {
                  ERREVENT: {
                    target:  '#client.ocppError'
                  },
                  START: {
                    target: '#client.createJ1772.Authorize.checking',
                    actions: assign({
                        idTag: (_, event) => event.idTag,
                        connectorId: (_, event) => event.connectorId
                    })
                  },
                  APPSTART: {
                    target: '#client.createJ1772.Authorize.checking',
                    actions: assign({
                        idTag: (_, event) => event.idTag,
                        connectorId: (_, event) => event.connectorId
                    })
                  },
                  DISCONNECT: {
                    target: 'checking',
                    actions: 'resetSocket',
                  }
                },
              },
            },
          },

          Authorize: {
            initial: 'checking',
            states: {
              checking: {
                always: [
                  { target: 'connected', cond: (context) => context.socket !== null },
                  { target: 'reconnecting' },
                ]
              },
              reconnecting: {
                invoke: {
                  src: 'reconnectToServer',
                  onDone: {
                    target: 'checking',
                    actions: assign({ socket: (_, event) => event.data }),
                  },
                },
              },
              connected: {
                invoke: {
                  id: 'AuthorizeReq',
                  src: 'AuthorizeReq',
                  onDone: [
                     {
                       target: '#client.createJ1772.StartTransaction.checking',
                       cond: (context, event) => event.data.idTagInfo.status === 'Accepted',
                       actions: logData,  // Add the log action here
                     },
                     {
                       target: '#client.createJ1772.Heartbeat.checking',
                       actions: logData,  // Add the log action here
                     },
                  ],
                  onError: {
                    // target: '#client.createJ1772.Heartbeat.checking',
                    target: '#client.ocppError',
                  },
                },
                on: {
                  DISCONNECT: {
                    target: 'checking',
                    actions: 'resetSocket',
                  }
                },
              },
            },
          },

          StartTransaction: {
            initial: 'checking',
            states: {
              checking: {
                always: [
                  { target: 'connected', cond: (context) => context.socket !== null },
                  { target: 'reconnecting' },
                ]
              },
              reconnecting: {
                invoke: {
                  src: 'reconnectToServer',
                  onDone: {
                    target: 'checking',
                    actions: assign({ socket: (_, event) => event.data }),
                  },
                },
              },
              connected: {
                invoke: {
                  id: 'StartTransactionReq',
                  src: 'StartTransactionReq',
                  onDone: [
                     {
                       target: '#client.createJ1772.MeterValues.checking',
                       actions: [
                         assign({
                           transactionId: (context, event) => event.data.transactionId
                         }),
                         async (context, event) => {
                           logData;
                           await db.update('transactionId', { data: event.data.transactionId });
                         },
                       ],
                       cond: (context, event) => event.data.idTagInfo.status === 'Accepted'
                     },
                     {
                       target: '#client.createJ1772.Heartbeat.checking',
                       actions: [
                         assign({
                           transactionId: () => 0,
                         }),
                         async (context, event) => {
                           await db.update('transactionId', { data: 0 });
                         },
                       ],
                     },
                  ],
                  onError: {
                    // target: '#client.createJ1772.Heartbeat.checking'
                    target: '#client.ocppError',
                  },
                },
                on: {
                  DISCONNECT: {
                    target: 'checking',
                    actions: 'resetSocket'
                  }
                },
              },
            },
          },

          MeterValues: {
            initial: 'checking',
            states: {
              checking: {
                always: [
                  { target: 'connected', cond: (context) => context.socket !== null },
                  { target: 'reconnecting' },
                ]
              },
              reconnecting: {
                invoke: [
                  {
                    id: 'MeterValuesReq',
                    src: 'MeterValuesReq',
                  },
                  {
                    src: 'reconnectToServer',
                    onDone: {
                      target: 'checking',
                      actions: assign({ socket: (_, event) => event.data }),
                    },
                  },
                ],
                on: {
                  STOP: {
                    target: '#client.createJ1772.DataTransfer.checking',
                  },
                  APPSTOP: {
                    target: '#client.createJ1772.DataTransfer.checking',
                  },
                  CALWATT: {
                    actions: [
                      assign({
                        current: (context, event) => event.current,
                        watt: (context, event) => context.watt + event.watt,
                      }),
                      async (context, event) => {
                        await db.update('watt', { data: context.watt });
                      },
                    ]
                  }
                },
              },
              connected: {
                invoke: [
                  {
                    id: 'MeterValuesReq',
                    src: 'MeterValuesReq',
                  },
                ],
                on: {
                  DISCONNECT: {
                    target: 'checking',
                    actions: 'resetSocket',
                  },
                  STOP: {
                    target: '#client.createJ1772.DataTransfer.checking',
                  },
                  APPSTOP: {
                    target: '#client.createJ1772.DataTransfer.checking',
                  },
                  CALWATT: {
                    actions: [
                      assign({
                        current: (context, event) => event.current,
                        watt: (context, event) => event.watt,
                      }),
                      async (context, event) => {
                        await db.update('watt', { data: context.watt });
                      },
                    ]
                  }
                },
              },
            },
          },

          DataTransfer: {
            states: {
              checking: {
                always: [
                  { target: 'connected', cond: (context) => context.socket !== null },
                  { target: 'reconnecting' },
                ]
              },
              // Stay in reconnecting state untill connection established
              reconnecting: {
                invoke: {
                  src: 'reconnectToServer',
                  onDone: {
                    target: 'checking',
                    actions: [
                      assign({ socket: (_, event) => event.data }),
                    ],
                  },
                },
              },
              connected: {
                invoke: [
                  {
                    id: 'DataTransferReq',
                    src: 'DataTransferReq',
                    onDone: {
                      target: '#client.createJ1772.StopTransaction.checking'
                    },
                    onError: {
                      target: '#client.ocppError',
                    },
                  },
                ],
                on: {
                  DISCONNECT: {
                    target: 'checking',
                    actions: 'resetSocket',
                  }
                },
              },
            },
          },

          StopTransaction: {
            initial: 'checking',
            states: {
              checking: {
                always: [
                  { target: 'connected', cond: (context) => context.socket !== null },
                  { target: 'reconnecting' },
                ]
              },
              // Stay in reconnecting state untill connection established
              reconnecting: {
                invoke: {
                  src: 'reconnectToServer',
                  onDone: {
                    target: 'checking',
                    actions: assign({ socket: (_, event) => event.data }),
                  },
                },
              },
              connected: {
                invoke: [
                  {
                    id: 'StopTransactionReq',
                    src: 'StopTransactionReq',
                    onDone: {
                      target: '#client.createJ1772.Heartbeat.checking',
                      actions: [
                        assign({
                          transactionId: () => 0,
                          elapsedTime: () => 0,
                          watt: () => 0,
                          responseBody: () => null,
                        }),
                        async (context, event) => {
                          await db.update('transactionId', { data: 0 });
                          await db.update('elapsedTime', { data: 0 });
                          await db.update('watt', { data: 0 });
                          await db.update('responseBody', { data: null });
                        },
                      ],
                    },
                    onError: {
                      target: '#client.ocppError',
                    },
                  },
                ],
                on: {
                  DISCONNECT: {
                    target: 'checking',
                    actions: 'resetSocket',
                  }
                },
              },
            },
          },

        },
      },
    },

    on: {
      INCREMENT_TIME: {
        actions: [
          assign({
            elapsedTime: (context) => context.elapsedTime + 1
          }),
          send((context) => ({
            type: 'UPDATED_WATT',
            watt: context.watt
          }), { to: 'MeterValuesReq'}),
          async (context) => {
            await db.update('elapsedTime', { data: context.elapsedTime });

            // only fetch responseBody when it's null
            if (context.responseBody === null) {
              let responseBodyDoc = await db.read('responseBody');
              context.responseBody = responseBodyDoc.data;
            };
          }
        ]
      },
    },

  },{
    activities: {
      // HeartBeatReq: (context) =>  {
      //   const interval = setInterval(() => {
      //     const messageId = randomUUID();
      //     const deferredPromise = deferred();
      //     const method = 'Heartbeat';
      //     context.pendingCalls.set(messageId, { ...deferredPromise, method });
      //
      //     console.log('Sending HeartbeatReq');
      //     context.socket.send(JSON.stringify([2, messageId, method, {}]));
      //
      //     deferredPromise.promise
      //       .then((result) => {
      //         console.log('Heartbeat successful, result:', result);
      //       })
      //       .catch((error) => {
      //         console.error('Heartbeat failed, error:', error);
      //         callback({ type: 'ERREVENT', error: error });
      //       });
      //
      //     ocppEventEmitter.emit('requestSent');
      //   }, 5000);
      //   return () => clearInterval(interval); // Cleanup function
      // },
      // StatusNotificationReq: (context, event) => {
      //   const interval = setInterval(() => {
      //     const messageId = randomUUID();
      //     const deferredPromise = deferred();
      //     const method = 'StatusNotification';
      //     context.pendingCalls.set(messageId, { ...deferredPromise, method });
      //
      //     console.log('Sending StatusNotificationReq');
      //     context.socket.send(JSON.stringify([2, messageId, method, {
      //       connectorId: context.connectorId,
      //       errorCode: 'NoError',
      //       // ConnectorLockFailure, EVCommunicationError, GroundFailure, HighTemperature, InternalError,
      //       // LocalListConflict, NoError, OtherError, OverCurrentFailure, OverVoltage,
      //       // ReaderFailure, ResetFailure, UnderVoltage, WeakSignal, PowerMeterFailure, PowerSwitchFailure,
      //       status: "Available",
      //       // Available, Preparing, Preparing, SuspendedEVSE,
      //       // SuspendedEV, Finishing, Reserved, Unavailable, Faulted
      //     }]));
      //
      //     deferredPromise.promise
      //       .then((result) => {
      //         console.log('StatusNotification successful, result:', result);
      //       })
      //       .catch((error) => {
      //         console.error('StatusNotification failed:', error.message);
      //         // callback({ type: 'ERREVENT', error: error });
      //       });
      //
      //     ocppEventEmitter.emit('requestSent');
      //   }, 10000);
      //   return () => clearInterval(interval); // Cleanup function
      // },
    },
    actions: {
      resetSocket: assign({
        socket: (context, event) => null
      }),
    },
    services: {
      connectToServer,
      reconnectToServer,
      HeartBeatReq: (context, event) => (callback, onReceive) => {
        const interval = setInterval(() => {
          const messageId = randomUUID();
          const deferredPromise = deferred();
          const method = 'Heartbeat';
          context.pendingCalls.set(messageId, { ...deferredPromise, method });

          console.log('Sending HeartbeatReq');
          context.socket.send(JSON.stringify([2, messageId, method, {}]));

          deferredPromise.promise
            .then((result) => {
              console.log('Heartbeat successful, result:', result);
            })
            .catch((error) => {
              console.error('Heartbeat failed:', error.message);
              callback({ type: 'ERREVENT', data: error });
            });

          ocppEventEmitter.emit('requestSent');
        }, 5000);
        return () => clearInterval(interval); // Cleanup function
      },
      StatusNotificationReq: (context, event) => (callback, onReceive) => {
        const interval = setInterval(() => {
          const messageId = randomUUID();
          const deferredPromise = deferred();
          const method = 'StatusNotification';
          context.pendingCalls.set(messageId, { ...deferredPromise, method });

          console.log('Sending StatusNotificationReq');
          context.socket.send(JSON.stringify([2, messageId, method, {
            connectorId: context.connectorId,
            errorCode: 'NoError',
            // ConnectorLockFailure, EVCommunicationError, GroundFailure, HighTemperature, InternalError,
            // LocalListConflict, NoError, OtherError, OverCurrentFailure, OverVoltage,
            // ReaderFailure, ResetFailure, UnderVoltage, WeakSignal, PowerMeterFailure, PowerSwitchFailure,
            status: "Available",
            // Available, Preparing, Preparing, SuspendedEVSE,
            // SuspendedEV, Finishing, Reserved, Unavailable, Faulted
          }]));

          deferredPromise.promise
            .then((result) => {
              console.log('StatusNotification successful, result:', result);
            })
            .catch((error) => {
              console.error('StatusNotification failed:', error.message);
              callback({ type: 'ERREVENT', data: error });
            });

          ocppEventEmitter.emit('requestSent');
        }, 10000);
        return () => clearInterval(interval); // Cleanup function
      },
      BootNotificationReq: (context) => new Promise((resolve, reject) => {
        const messageId = randomUUID();
        const method = 'BootNotification';
        context.pendingCalls.set(messageId, {resolve, reject, method });

        console.log('Sending BootNotificationReq');
        context.socket.send(JSON.stringify([2, messageId, method, {
          chargePointModel: context.chargePointModel,
          chargePointVendor: context.identity,
        }]));
        ocppEventEmitter.emit('requestSent');
      }),
      AuthorizeReq: (context) => new Promise((resolve, reject) => {
        const messageId = randomUUID();
        const method = 'Authorize';
        context.pendingCalls.set(messageId, {resolve, reject, method });

        console.log('Sending AuthorizeReq');
        context.socket.send(JSON.stringify([2, messageId, method, {
          idTag: context.idTag,
        }]));
        ocppEventEmitter.emit('requestSent');
      }),
      StartTransactionReq: (context, event) => new Promise((resolve, reject) => {
        const messageId = randomUUID();
        const method = 'StartTransaction';
        context.pendingCalls.set(messageId, {resolve, reject, method });

        console.log('Sending StartTransactionReq');
        context.socket.send(JSON.stringify([2, messageId, method, {
          connectorId: context.connectorId,
          idTag: context.idTag,
          meterStart: 0,
          timestamp: new Date().toISOString(),
        }]));
        ocppEventEmitter.emit('requestSent');
      }),
      MeterValuesReq: (context, event) => (callback, onReceive) => {
        let localWatt = context.watt;
        onReceive((receivedEvent) => {
          if (receivedEvent.type === 'UPDATED_WATT') {
            localWatt = receivedEvent.watt;
          }
        });

        const timeoutId = setInterval(() => {
          try {
            const messageId = randomUUID();
            const deferredPromise = deferred();
            const method = 'MeterValues';

            console.log('Sending MeterValues');
            // Store the method name along with resolve and reject in the pendingCalls
            context.pendingCalls.set(messageId, { ...deferredPromise, method });

            if(context.socket) {
              context.socket.send(JSON.stringify([2, messageId, method, {
                connectorId: context.connectorId,
                transactionId: context.transactionId,
                meterValue: [
                 {
                  timestamp: new Date().toISOString(),
                  sampledValue: [
                    {
                      value: (localWatt/3600).toFixed(2),
                      context: "Sample.Periodic",
                      format: "Raw",
                      measurand: "Energy.Active.Import.Register",
                      location: "Outlet",
                      unit: "Wh"
                    }
                  ]
                }
              ]
              }]));
            };

            callback({ type: 'INCREMENT_TIME' });
            deferredPromise.promise
              .then((result) => {
                console.log('MeterValues successful, result:', result);
              })
              .catch((error) => {
                callback({ type: 'ERREVENT', error: error });
                console.error('MeterValues failed, error:', error);
              });
          } catch (error) {
            console.error('Error while checking:', error);
          }

          ocppEventEmitter.emit('requestSent');
        }, 1000);

        return () => {
          clearTimeout(timeoutId);
        };
      },
      StopTransactionReq: (context, event) => new Promise(async (resolve, reject) => {
        const messageId = randomUUID();
        const method = 'StopTransaction';
        context.pendingCalls.set(messageId, {resolve, reject, method });

        console.log('Sending StopTransactionReq');
        context.socket.send(JSON.stringify([2, messageId, method, {
          meterStop: (context.watt/3600),
          timestamp: new Date().toISOString(),
          transactionId: context.transactionId,
        }]));
        ocppEventEmitter.emit('requestSent');
      }),
      DataTransferReq: (context, event) => new Promise(async (resolve, reject) => {
        let responseBodyDoc = await db.read('responseBody');
        let responseBody = responseBodyDoc.data;
        responseBody.elapsedTime = context.elapsedTime;
        context.responseBody = responseBody;

        const messageId = randomUUID();
        const method = 'DataTransfer';
        context.pendingCalls.set(messageId, {resolve, reject, method });

        console.log('Sending DataTransferReq');
        context.socket.send(JSON.stringify([2, messageId, method, {
          vendorId: config.identity,
          data: JSON.stringify(responseBody),
        }]));
        ocppEventEmitter.emit('requestSent');

        // reject(new Error("Simulated error"));
        // return;
      }),
    }
  })
};

let ocppinterpreter = null;

// async function start() {
//   const ocppstateMachine = createOCPPStateMachine();
//   ocppinterpreter = interpret(ocppstateMachine)
//       .onTransition((state) => {
//           const ocppstate = JSON.stringify(state.value);
//           console.log(`ocppstateMachine is now in state ${ocppstate}`);
//       })
//       .start();
// };
// start();

async function start() {
  let validator = null;

  await db.create('transactionId', { data: 0 });
  await db.create('elapsedTime', { data: 0 });
  await db.create('watt', { data: 0 });
  await db.create('responseBody', { data: null });

  const transactionId = await db.read('transactionId');
  const elapsedTime = await db.read('elapsedTime');
  const watt = await db.read('watt');

  if(config.protocols[0] == "v1.6") {
    validator = createValidator('ocpp1.6', require('./schemas/ocpp1_6.json'));
  } else if(config.protocols[0] === "v2.0.1") {
    validator = createValidator('ocpp2.0.1', require('./schemas/ocpp2_0_1.json'));
  }

  const ocppstateMachine = createOCPPStateMachine(transactionId.data, elapsedTime.data, watt.data, validator);
  ocppinterpreter = interpret(ocppstateMachine).start();
};

start();

ocppEventEmitter.on('requestSent', () => {
  const currentState = JSON.stringify(ocppinterpreter.state.value);
  console.log(`ocppstateMachine is now in state ${currentState}`);
});

// "Tap Card" // "Press Stop Button" // "Get an Error" // 'Set PWM 100'
// 'Set PWM 50' // 'Get GFITestError' // 'Get OverHeatError' // 'Get OverCurrentError'

process.stdin.setEncoding('utf8');
process.stdin.on('data', async (data) => {
    const input = data.trim();
    if (data.trim() === '1') {
        console.log("START");
        ocppinterpreter.send({ type: 'START', idTag: '0.1.0.255.0.21.49.0.', connectorId: 1});
    } else if (data.trim() === '2') {
        console.log("STOP");
        ocppinterpreter.send({ type: 'STOP'});
    }
});

function gracefulShutdown() {
  console.log('Graceful shutdown completed, exiting...');
  process.exit();
};

// ocppinterpreter.send({
//     type: 'CALWATT',
//     current: 10,
//     current: 10,
// });

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);
