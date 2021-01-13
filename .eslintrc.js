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
            "error",
            4
        ],
        "linebreak-style": [
            "error",
            "unix"
        ],
        "quotes": [
            "error",
            "double"
        ],
        "semi": [
            "error",
            "always"
        ],
        "no-empty": [
            "error",
            { "allowEmptyCatch": true }
        ],
        "no-unused-vars": "warn",
        "no-redeclare": "warn",
        "no-constant-condition": "warn",
        "no-useless-escape": "warn",
        "no-case-declarations": "warn",
    }
};
