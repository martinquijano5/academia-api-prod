module.exports = [
  {
    // Definimos los entornos y reglas para Node y ES2020
    files: ["**/*.js"],
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: "module",
    },
    rules: {
      "no-restricted-globals": ["error", "name", "length"],
      "prefer-arrow-callback": "error",
      "quotes": ["error", "double", { allowTemplateLiterals: true }],
      "linebreak-style": "off",
      "max-len": ["error", { code: 500 }],
      "require-jsdoc": "off",
      "valid-jsdoc": "off",
    },
  },
  {
    // Configuración específica para pruebas
    files: ["**/*.spec.*"],
    env: {
      mocha: true,
    },
    rules: {
      // Puedes agregar reglas específicas para archivos de pruebas aquí
    },
  },
];
