const CHARSET = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
module.exports = {
    encode: (num) => {
        if (num === 0) return CHARSET[0];
        let res = '';
        while (num > 0) { res = CHARSET[num % 62] + res; num = Math.floor(num / 62); }
        return res;
    },
    decode: (str) => {
        let res = 0;
        for (let i = 0; i < str.length; i++) { res = res * 62 + CHARSET.indexOf(str[i]); }
        return res;
    }
};
