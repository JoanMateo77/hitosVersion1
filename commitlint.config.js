// Conventional Commits (feat:, fix:, chore:…). La descripción va en español y
// puede llevar nombres propios, así que no se fuerza mayúscula/minúscula.
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'subject-case': [0],
    'header-max-length': [2, 'always', 130],
    'body-max-line-length': [0],
  },
}
