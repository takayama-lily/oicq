module.exports = {
    "env": {
        "commonjs": true,
        "es2021": true,
        "node": true
    },
    "extends": "eslint:recommended",
    "parser": "babel-eslint",
    "parserOptions": {
        "ecmaVersion": 12
    },
    "rules": {
        "indent": [
            "warn",
            4
        ],
        "linebreak-style": [
            "error",
            "unix"
        ],
        "quotes": [
            "warn",
            "double"
        ],
        "semi": [
            "warn",
            "always"
        ],
        "no-empty": [
            "warn",
            { "allowEmptyCatch": true }
        ],
        "no-unused-vars": "warn",
        "no-redeclare": "warn",
        "no-constant-condition": "warn",
        "no-useless-escape": "warn",
        "no-case-declarations": "warn",
    },
    "standard": {
        "env": [ "mocha" ]
    }
};
