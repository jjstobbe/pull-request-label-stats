const fs = require('fs');

Object.defineProperty(Array.prototype, 'chunk', {
    value: function(chunkSize) {
        var R = [];

        for (var i = 0; i < this.length; i += chunkSize) {
            R.push(this.slice(i, i + chunkSize));
        }

        return R;
    }
});

readJsonFile = (path) => {
    let rawData = fs.readFileSync(path);
    return JSON.parse(rawData);
}

sleep = (ms) => {
    return new Promise(resolve=>{
        setTimeout(resolve,ms)
    })
}

module.exports = { readJsonFile, sleep }
