import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { obfuscator } from 'rollup-obfuscator'

export default defineConfig({
  plugins: [react()],
  base: '/typometry/',
  build: {
    minify: 'terser',
    terserOptions: {
      mangle: true,
      compress: {
        drop_console: true,
        drop_debugger: true
      }
    },
    rollupOptions: {
      plugins: [
        obfuscator({
          compact: true,
          controlFlowFlattening: true,
          controlFlowFlatteningThreshold: 0.5,
          deadCodeInjection: true,
          deadCodeInjectionThreshold: 0.2,
          debugProtection: false,
          disableConsoleOutput: true,
          identifierNamesGenerator: 'hexadecimal',
          renameGlobals: false,
          rotateStringArray: true,
          selfDefending: true,
          stringArray: true,
          stringArrayThreshold: 0.75,
          unicodeEscapeSequence: false
        })
      ]
    }
  }
})