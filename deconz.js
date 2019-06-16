var request = require('request');
var NODE_PATH = '/deconz/';

module.exports = function (RED) {

    var devices = {};

    /**
     * httpAdmin.get
     *
     * Enable http route to static files
     *
     */
    RED.httpAdmin.get(NODE_PATH + 'static/*', function (req, res) {
        var options = {
            root: __dirname + '/static/',
            dotfiles: 'deny'
        };
        res.sendFile(req.params[0], options);
    });


    /**
     * httpAdmin.get
     *
     * Enable http route to JSON itemlist for each controller (controller id passed as GET query parameter)
     *
     */
    RED.httpAdmin.get(NODE_PATH + 'itemlist', function (req, res) {
        var config = req.query;
        var controller = RED.nodes.getNode(config.controllerID);
        var forceRefresh = config.forceRefresh ? ['1', 'yes', 'true'].includes(config.forceRefresh.toLowerCase()) : false;

        if (controller && controller instanceof deConzServerNode) {
            controller.getItemsList(function (items) {
                if (items) {
                    res.json(items);
                } else {
                    res.status(404).end();
                }
            }, forceRefresh);
        } else {
            res.status(404).end();
        }
    });

    RED.httpAdmin.get(NODE_PATH + 'statelist', function (req, res) {
        var config = req.query;
        var controller = RED.nodes.getNode(config.controllerID);
        var forceRefresh = config.forceRefresh ? ['1', 'yes', 'true'].includes(config.forceRefresh.toLowerCase()) : false;

        if (controller && controller instanceof deConzServerNode) {
            controller.getDeviceMeta(function (items) {
                if (items) {
                    res.json(items.state);
                } else {
                    res.status(404).end();
                }
            }, config.uniqueid);
        } else {
            res.status(404).end();
        }
    });

    RED.httpAdmin.get(NODE_PATH + 'gwscanner', function (req, res) {
        // var ip = require("ip");
        // console.log ( ip.address() );

        var portscanner = require('portscanner');

// 127.0.0.1 is the default hostname; not required to provide
        portscanner.findAPortNotInUse([80], '127.0.0.1').then(port => {
            console.log(`Port ${port} is available!`);

            // Now start your service on this port...
        });
    });


    //*************** Input Node ***************
    function deConzItemIn(config) {
        RED.nodes.createNode(this, config);
        var node = this;
        node.config = config;

        node.sendState = function (device) {
            //status
            node.status({
                fill: "green",
                shape: "dot",
                text: (node.config.state in device.state) ? device.state[node.config.state] : "connected"
            });

            //outputs
            node.send([
                {payload: (node.config.state in device.state) ? device.state[node.config.state] : device.state, payload_raw: device},
                format_to_homekit(device)
            ]);
        };

        //get server node
        node.server = RED.nodes.getNode(config.server);
        if (!node.server) return status_no_server(node);

        //check if this device exists
        node.server.getDeviceMeta(function(deviceMeta){
            if (!deviceMeta) {
                node.status({
                    fill: "red",
                    shape: "dot",
                    text: 'Device not found'
                });
            }
        }, config.device);

        if (typeof (config.device) == 'string' && config.device.length) {
            node.server.getDeviceMeta(function (deviceMeta) {
                if (deviceMeta) {
                    devices[node.id] = deviceMeta.uniqueid;
                    node.meta = deviceMeta;
                    node.sendState(deviceMeta);
                } else {
                    node.status({
                        fill: "red",
                        shape: "dot",
                        text: 'Device not found'
                    });
                }
            }, config.device);
        } else {
            node.status({
                fill: "red",
                shape: "dot",
                text: 'Device not set'
            });
        }
    }
    RED.nodes.registerType("deconz-input", deConzItemIn);


    //*************** GET Node ***************
    function deConzItemGet(config) {
        RED.nodes.createNode(this, config);
        var node = this;

        node.config = config;
        node.cleanTimer = null;

        //get server node
        node.server = RED.nodes.getNode(config.server);
        if (!node.server) return status_no_server(node);


        //check if this device exists
        node.server.getDeviceMeta(function(deviceMeta){
            if (!deviceMeta) {
                node.status({
                    fill: "red",
                    shape: "dot",
                    text: 'Device not found'
                });
            }
        }, config.device);


        if (typeof(config.device) == 'string'  && config.device.length) {
            node.status({}); //clean

            this.on('input', function (message) {
                clearTimeout(node.cleanTimer);

                node.server.getDeviceMeta(function(deviceMeta){
                    if (deviceMeta) {
                        devices[node.id] = deviceMeta.uniqueid;

                        node.meta = deviceMeta;

                        node.status({
                            fill: "green",
                            shape: "dot",
                            text: (config.state in node.meta.state)?(node.meta.state[config.state]?node.meta.state[config.state]:''):"received",
                        });

                        node.send({
                            payload:(config.state in node.meta.state)?node.meta.state[config.state]:node.meta.state,
                            meta:deviceMeta,
                        });

                        node.cleanTimer = setTimeout(function(){
                            node.status({}); //clean
                        }, 3000);
                    } else {
                        node.status({
                            fill: "red",
                            shape: "dot",
                            text: 'Device not found'
                        });
                    }
                }, config.device);

            });
        } else {
            node.status({
                fill: "red",
                shape: "dot",
                text: 'Device not set'
            });
        }
    }

    RED.nodes.registerType("deconz-get", deConzItemGet);


    //*************** State Output Node ***************
    function deConzOut(config) {
        RED.nodes.createNode(this, config);
        var node = this;
        node.device = config.device;

        //get server node
        node.server = RED.nodes.getNode(config.server);
        if (!node.server) return status_no_server(node);

        node.payload = config.payload;
        node.payloadType = config.payloadType;
        node.command = config.command;
        node.commandType = config.commandType;
        node.cleanTimer = null;

        //check if this device exists
        node.server.getDeviceMeta(function(deviceMeta){
            if (!deviceMeta) {
                node.status({
                    fill: "red",
                    shape: "dot",
                    text: 'Device not found'
                });
            }
        }, config.device);

        if (typeof(config.device) == 'string'  && config.device.length) {
            node.status({}); //clean

            this.on('input', function (message) {
                clearTimeout(node.cleanTimer);

                var payload;
                switch (node.payloadType) {
                    case 'flow':
                    case 'global': {
                        RED.util.evaluateNodeProperty(node.payload, node.payloadType, this, message, function (error, result) {
                            if (error) {
                                node.error(error, message);
                            } else {
                                payload = result;
                            }
                        });
                        break;
                    }
                    case 'date': {
                        payload = Date.now();
                        break;
                    }
                    case 'object':
                    case 'homekit':
                    case 'msg':
                    case 'num':
                    case 'str':
                    default: {
                        payload = message[node.payload];
                        break;
                    }
                }

                var command;
                switch (node.commandType) {
                    case 'msg': {
                        command = message[node.command];
                        break;
                    }
                    case 'deconz_cmd':
                        command = node.command;
                        switch (command) {
                            case 'on':
                                payload = payload && payload != '0'?true:false;
                                break;

                            case 'bri':
                            case 'hue':
                            case 'sat':
                            case 'ct':
                            case 'colorloopspeed':
                            case 'transitiontime':
                                payload = parseInt(payload);
                                break;

                            case 'json':
                            case 'alert':
                            case 'effect':
                            default: {
                                break;
                            }
                        }
                        break;

                    case 'homekit':
                        payload = format_from_homekit(message, payload);
                        break;

                    case 'str':
                    default: {
                        command = node.command;
                        break;
                    }
                }

                //empty payload, stop
                if (payload === null) {
                    return false;
                }

                console.log('//send data to API');
                // console.log(payload);
                //send data to API
                node.server.getDeviceMeta(function(deviceMeta){
                    if (deviceMeta) {
                        var url = 'http://'+node.server.ip+':'+node.server.port+'/api/'+node.server.apikey+'/lights/'+deviceMeta.device_id+'/state';
                        var post = {};
                        if (node.commandType == 'object' || node.commandType == 'homekit') {
                            post = payload;
                        } else {
                            if (command != 'on') post['on'] = true;
                            if (command == 'bri') post['on'] = payload > 0 ? true : false;
                            post[command] = payload;
                        }


                        // post["on"] = true;
                        node.log('Requesting url: '+url);
                        console.log(post);

                        request.put({
                            url:     url,
                            form:    JSON.stringify(post)
                        }, function(error, response, body){
                            if (body) {
                                var response = JSON.parse(body)[0];

                                if ('success' in response) {
                                    node.status({
                                        fill: "green",
                                        shape: "dot",
                                        text: "ok",
                                    });
                                } else if ('error' in response) {
                                    response.error.post = post; //add post data
                                    node.warn('deconz-out ERROR: '+response.error.description);
                                    node.warn(response.error);
                                    node.status({
                                        fill: "red",
                                        shape: "dot",
                                        text: "error",
                                    });
                                }

                                node.cleanTimer = setTimeout(function(){
                                    node.status({}); //clean
                                }, 3000);
                            }
                        });

                    } else {
                        node.status({
                            fill: "red",
                            shape: "dot",
                            text: 'Device not found'
                        });
                    }
                }, config.device);




                // /api/<apikey>/lights/<id>/state
            });
        } else {
            node.status({
                fill: "red",
                shape: "dot",
                text: 'Device not set'
            });
        }
    }

    RED.nodes.registerType("deconz-output", deConzOut);


    //*************** Server Node ***************
    function deConzServerNode(n) {
        RED.nodes.createNode(this, n);
        var node = this;
        node.items = undefined;
        node.items_list = undefined;
        node.name = n.name;
        node.ip = n.ip;
        node.port = n.port;
        node.ws_port = n.ws_port;
        node.apikey = n.apikey;
        node.pingTimeout = undefined;


        this.discoverDevices = function (callback, forceRefresh = false) {
            if (forceRefresh || node.items === undefined) {
                node.log('discoverDevices: Refreshing devices list');

                var url = "http://" + node.ip + ":" + node.port + "/api/" + node.apikey;
                node.log('discoverDevices: Requesting: ' + url);

                request.get(url, function (error, result, data) {
                    if (error) {
                        callback(error);
                        return;
                    }

                    try {
                        var dataParsed = JSON.parse(data);
                    } catch (e) {
                        callback(RED._("deconz.error.invalid-json"));
                        return;
                    }

                    node.items = [];
                    if (dataParsed) {
                        for (var index in dataParsed.sensors) {
                            var prop = dataParsed.sensors[index];
                            prop.device_type = 'sensors';
                            prop.device_id = parseInt(index);

                            node.items[prop.uniqueid] = prop;
                        }

                        for (var index in dataParsed.lights) {
                            var prop = dataParsed.lights[index];
                            prop.device_type = 'lights';
                            prop.device_id = parseInt(index);

                            node.items[prop.uniqueid] = prop;
                        }
                    }
                    // console.log(node.items);
                    callback(node.items);
                    return node.items;
                });
            } else {
                node.log('discoverDevices: Using cached devices');
                callback(node.items);
                return node.items;
            }
        }

        this.getDeviceMeta = function (callback, uniqueid) {
            var result = null;

            node.discoverDevices(function(items){
                if (items) {
                    for (var index in items) {
                        var item = items[index];
                        if (index === uniqueid) {
                            result = item;
                            break;
                        }
                    }
                }

                callback(result);
                return result;
            }, false);
        }

        this.getItemsList = function (callback, forceRefresh = false) {
            node.discoverDevices(function(items){
                node.items_list = [];
                for (var index in items) {
                    var prop = items[index];

                    node.items_list.push({
                        device_name: prop.name + ' : ' + prop.type,
                        uniqueid: prop.uniqueid,
                        meta: prop
                    });
                }

                callback(node.items_list);
                return node.items_list;
            }, forceRefresh);
        }

        // this.heartbeat = function() {
        //     clearTimeout(node.pingTimeout);
        //
        //     // Use `WebSocket#terminate()` and not `WebSocket#close()`. Delay should be
        //     // equal to the interval at which your server sends out pings plus a
        //     // conservative assumption of the latency.
        //     node.pingTimeout = setTimeout(() => {
        //         this.terminate();
        //     }, 15000 + 1000);
        // }

        // this.discoverDevices(node);
        connect(node, {host:node.ip, port:node.ws_port});
    }

    RED.nodes.registerType("deconz-server", deConzServerNode);


    function connect(serverNode, config) {
        const WebSocket = require('ws');
        const ws = new WebSocket('ws://' + config.host + ':' + config.port);


        ws.on('open', function open() {
            console.log('Connected to WebSocket');

        });

        ws.on('error',  function(err) {
            serverNode.warn('deCONZ error: '+err);
        });

        ws.on('message', function(data) {
            if (data) {
                var dataParsed = JSON.parse(data);
                for (var nodeId in devices) {
                    var item = devices[nodeId];


                    if (dataParsed.uniqueid === item) {
                        var node = RED.nodes.getNode(nodeId);
                        if (node && "server" in node) {
                            //update server items db
                            var serverNode = RED.nodes.getNode(node.server.id);
                            serverNode.items[dataParsed.uniqueid].state = dataParsed.state;

                            if (node.type === "deconz-input") {
                                node.sendState(dataParsed);
                            }
                        } else {
                            console.log('ERROR: cant get '+nodeId+' node');
                        }
                    }
                }
            }
        });

        ws.on('close', function close() {
            clearTimeout(serverNode.pingTimeout);
            // setTimeout(connect(serverNode, config), 15000);
            serverNode.warn('deCONZ WebSocket closed');

            for (var nodeId in devices) {
                var node = RED.nodes.getNode(nodeId);
                node.status({
                    fill: "red",
                    shape: "dot",
                    text: 'disconnected'
                });
            }
        });

        // ws.on('open', serverNode.heartbeat);
        // ws.on('ping', serverNode.heartbeat);
    }


    function format_to_homekit(device) {
        var state = device.state;
        var msg = {};


// console.log(device.state);



        var characteristic = {};
        if (state !== undefined){

            // if (device.device_type === 'sensors') {
            //     switch (device.type) {
            //         case "ZHATemperature":
            //             characteristic.CurrentTemperature = state.temperature/100;
            //             break;
            //         case "ZHAHumidity":
            //             characteristic.CurrentRelativeHumidity = state.humidity/100;
            //             break;
            //         case "ZHALightLevel":
            //             // characteristic.CurrentRelativeHumidity = state.humidity;
            //             break;
            //         case "ZHAPresence":
            //             // characteristic.CurrentRelativeHumidity = state.humidity;
            //             break;
            //         case "ZHAOpenClose":
            //             // characteristic.ContactSensorState = state.humidity;
            //             break;
            //         case "ZHASwitch":
            //             // characteristic.ContactSensorState = state.humidity;
            //             break;
            //         case "CLIPLightlevel":
            //             // characteristic.ContactSensorState = state.humidity;
            //             break;
            //         case "CLIPHumidity":
            //             // characteristic.ContactSensorState = state.humidity;
            //             break;
            //         case "CLIPTemperature":
            //             // characteristic.ContactSensorState = state.humidity;
            //             break;
            //         case "CLIPPresence":
            //             // characteristic.ContactSensorState = state.humidity;
            //             break;
            //         case "CLIPOpenClose":
            //             // characteristic.ContactSensorState = state.humidity;
            //             break;
            //         case "CLIPSwitch":
            //             // characteristic.ContactSensorState = state.humidity;
            //             break;
            //         case "CLIPGenericStatus":
            //             // characteristic.ContactSensorState = state.humidity;
            //             break;
            //         case "CLIPGenericFlag":
            //             // characteristic.ContactSensorState = state.humidity;
            //             break;
            //         case "Daylight":
            //             // characteristic.ContactSensorState = state.humidity;
            //             break;
            //     }
            // }

            if (state['temperature'] !== undefined){
                characteristic.CurrentTemperature = state.temperature/100;
            }

            if (state['humidity'] !== undefined){
                characteristic.CurrentRelativeHumidity = state.humidity/100;
            }

            if (state['lux'] !== undefined){
                characteristic.CurrentAmbientLightLevel = state['lux'];
            }
            
            if (state['fire'] !== undefined){
                characteristic.SmokeDetected = state.fire;
            }

            if (state['buttonevent'] !== undefined){
                //https://github.com/dresden-elektronik/deconz-rest-plugin/wiki/Xiaomi-WXKG01LM
                if (state['buttonevent'] == 1002) characteristic.ProgrammableSwitchEvent = 0;
                else if (state['buttonevent'] == 1004) characteristic.ProgrammableSwitchEvent = 1;
                else if (state['buttonevent'] == 1001) characteristic.ProgrammableSwitchEvent = 2;
            }

            if (state['presence'] !== undefined){
                characteristic.MotionDetected = state.presence;
            }

            if (state['open'] !== undefined){
                characteristic.ContactSensorState = state.open;
            }

            if (state['vibration'] !== undefined){
                characteristic.ContactSensorState = state.vibration;
            }

            if (state['on'] !== undefined){
                characteristic.On = state.on;
            }

            if (state['bri'] !== undefined){
                characteristic.Brightness = state.bri/2.55
            }

            if (state['hue'] !== undefined){
                characteristic.Hue = state.hue/182;
            }

            if (state['sat'] !== undefined){
                characteristic.Saturation = state.sat/2.55
            }

            if (state['ct'] !== undefined){
                characteristic.ColorTemperature = state.ct;
                if (state.ct < 140) characteristic.ColorTemperature = 140;
                else if (state.ct > 500) characteristic.ColorTemperature = 500;
            }
        }

        msg.payload = characteristic;
        return msg;
    }

    function format_from_homekit(message, payload) {
        if (message.hap.context === undefined) {
            return null;
        }

        var msg = {};

        if (payload.On !== undefined) {
            msg['on'] = payload.On;
        } else if (payload.Brightness !== undefined) {
            msg['bri'] = payload.Brightness*2.55;
            msg['on'] = payload.Brightness>0?true:false;
        } else if (payload.Hue !== undefined) {
            msg['hue'] = payload.Hue*182;
            msg['on'] = true;
        } else if (payload.Saturation !== undefined) {
            msg['sat'] = payload.Saturation*2.55;
            msg['on'] = true;
        } else if (payload.ColorTemperature !== undefined) {
            msg['ct'] = payload.ColorTemperature;
            msg['on'] = true;
        }

        return msg;
    }

    function status_no_server(node) {
        node.status({
            fill: "red",
            shape: "dot",
            text: 'Server node error'
        });

        return false;
    }
}
