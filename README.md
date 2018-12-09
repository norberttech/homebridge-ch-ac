# Control Gree and partners Air Conditioning with homekit

This plugins is based on https://github.com/ddenisyuk/homebridge-gree-heatercooler.

Should work with all Cooper&Hunter AC controlled by EWPE Smart APP. 

## Requirements 
- NodeJS (>=8.9.3) with NPM (>=6.4.1)

For each AC device you need to add an accessory and specify the IP address of the device.

## Usage Example:
```
{
    "bridge": {
        "name": "Homebridge",
        "username": "CC:22:3D:E3:CE:30",
        "port": 51826,
        "pin": "123-45-568"
    },
    "accessories": [
        {
            "accessory": "CooperHunterAC",
            "host": "192.168.1.X",
            "name": "Bedroom AC",
            "serial": "ch-00-00-01",
            "model": "CH-S09FTXE WIFI",
            "tempSensorShift": 40,
            "updateInterval": 10000
        },
        {
            "accessory": "CooperHunterAC",
            "host": "192.168.1.Y",
            "name": "Living room AC",
            "serial": "ch-00-00-02",
            "model": "CH-S09FTXE WIFI",
            "tempSensorShift": 40,
            "updateInterval": 10000
        }
    ]
}
```

