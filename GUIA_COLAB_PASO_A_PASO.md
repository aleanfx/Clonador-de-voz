# 🎙️ Guía Completa: Qwen3-TTS con Google Colab

---

## 📊 PARTE 1: Cómo Ver los Límites de Google Colab

### Ver uso de GPU en tiempo real
Dentro de tu notebook de Colab:
1. Mira la esquina **superior derecha** → verás **RAM** y **Disco** con barras verdes
2. Haz clic en esas barras para ver detalles de uso
3. Si la barra de RAM se pone **roja**, estás cerca del límite

### Ver tiempo restante de GPU
1. En Colab, ve a **Entorno de ejecución** → **Ver recursos**
2. Te muestra: RAM usada, Disco usado, y GPU
3. La GPU T4 gratuita tiene **~15GB VRAM** y **~12 horas** por sesión

### Señales de que estás cerca del límite
- ⚠️ Colab te muestra un aviso amarillo: "Se está quedando sin RAM"
- ⚠️ El notebook se desconecta automáticamente tras ~90 min de inactividad
- ⚠️ Aparece mensaje: "No se puede conectar a un entorno de ejecución de GPU"
- ⚠️ La celda tarda mucho o dice "Cuota de GPU agotada"

### Verificar cuota restante de GPU
1. Ve a: https://colab.research.google.com/
2. Haz clic en tu **foto de perfil** (esquina superior derecha)
3. Selecciona **"Uso de recursos"** o **"Resource usage"**
4. Te muestra cuánto has usado en las últimas 24 horas

### Tips para ahorrar GPU
- **NO dejes Colab abierto sin usar** — desconecta el entorno si no lo necesitas
- Usa **Fast (0.6B)** para pruebas rápidas, **Quality (1.7B)** solo para audio final
- Reinicia el entorno entre cambios de modelo para liberar VRAM

---

## 🚀 PARTE 2: Paso a Paso para Abrir Todo Desde Cero

### PASO 1: Abrir el Frontend (Página Web)
1. Ya no necesitas abrir la consola negra en tu PC.
2. Ve directamente a tu página en producción: **https://clonador-de-voz.vercel.app/**
3. (Guarda este enlace en tus favoritos, es tu plataforma oficial).

### PASO 2: Crear Cuenta o Iniciar Sesión
1. Al abrir el frontend verás la **pantalla de login** de Qwen3-TTS
2. Si es tu **primera vez**: haz clic en **"Regístrate aquí"** → llena email y contraseña → **"Crear Cuenta"**
3. Si **ya tienes cuenta**: pon tu email y contraseña → **"Iniciar Sesión"**
4. Al entrar verás la interfaz de TTS con tu **balance de tokens** en el sidebar

> ⚠️ **IMPORTANTE**: Necesitas tener **tokens** (caracteres) para generar audio. Si tu balance es 0, haz clic en **"Recargar Tokens"** y sigue las instrucciones de pago.

### PASO 3: Abrir Google Colab
1. Abre tu navegador
2. Ve a: https://colab.research.google.com/
3. Inicia sesión con tu cuenta de Google
4. Busca tu notebook **"Colab_Backend.ipynb"** en Recientes
   - O ve a Google Drive → busca "Colab_Backend"

### PASO 4: Conectar GPU
1. En Colab, ve a **Entorno de ejecución** → **Cambiar tipo de entorno de ejecución**
2. Selecciona **T4 GPU**
3. Dale a **Guardar**

### PASO 5: Ejecutar todas las celdas
1. Ve a **Entorno de ejecución** → **Ejecutar todas** (o Ctrl+F9)
2. Espera a que se ejecuten todas las celdas (~3-5 minutos)
3. La última celda te mostrará algo como:

```
============================================================
✅ SERVIDOR BACKEND ACTIVO EN LA NUBE ✅

Copia este enlace exacto:
   https://XXXXX.ngrok-free.dev
============================================================
```

### PASO 6: Conectar Frontend con Backend
1. **Copia** la URL de ngrok que te dio Colab (ejemplo: `https://xxxxx.ngrok-free.dev`)
2. Ve a tu frontend en **https://clonador-de-voz.vercel.app/**
3. En la sección **CONFIGURACIÓN** → **URL del Backend (API)**
4. **Pega** la URL de ngrok ahí
5. El indicador debería cambiar a **"Online"** con info de la GPU

### PASO 7: ¡Generar Audio!
1. Selecciona el modo (Clonar Voz, Diseñar Voz, o Voz Personalizada)
2. Escribe tu texto
3. Sube audio de referencia (si es clonar voz)
4. Haz clic en **"Generar Audio"**
5. ¡Espera y disfruta! 🎵
6. Se descontarán los caracteres usados de tu balance de tokens

---

## 💰 Sistema de Tokens y Pagos

### ¿Cómo funciona?
- Cada generación de audio **descuenta** la cantidad de caracteres del texto de tu balance
- Si no tienes suficientes tokens, no podrás generar audio
- Precio: **50 USDT = 2,400,000 caracteres**

### ¿Cómo recargar tokens?
1. Haz clic en **"Recargar Tokens"** en el sidebar
2. Elige tu método de pago:
   - **USDT BEP20**: Transfiere a `0x233b61263eb0d5faa859e7d4d5591da87929c003`
   - **Binance ID**: Transfiere al ID `354902745`
3. Toma **captura de pantalla** del comprobante
4. Sube la captura en el modal de pago → **"Enviar Comprobante"**
5. El admin revisará tu pago y aprobará tus tokens

### Panel de Admin (solo para el dueño)
- El botón 🛡️ en el sidebar abre el **Panel de Administración**
- Aquí puedes ver pagos pendientes y **aprobar** o **rechazar** con un clic
- Al aprobar, se acreditan automáticamente **2,400,000 tokens** al usuario

---

## ⚠️ Problemas Comunes y Soluciones

### "Error de conexión" o "CORS Error"
- **Causa**: La URL de ngrok expiró o el servidor se cayó
- **Solución**: Ve a Colab → Entorno de ejecución → Ejecutar todas → Copia nueva URL

### "No se puede conectar a GPU"
- **Causa**: Agotaste la cuota de GPU gratuita
- **Solución**: Espera unas horas o usa otra cuenta de Google

### "Out of Memory" al generar audio
- **Causa**: La GPU no tiene suficiente VRAM
- **Solución**: 
  1. Ve a Colab → Entorno de ejecución → Reiniciar sesión
  2. Ejecutar todas → Usa modelo Fast (0.6B) en vez de Quality

### "ERR_NGROK_108" (sesión duplicada)
- **Causa**: Ya hay una sesión de ngrok activa
- **Solución**: Ve a https://dashboard.ngrok.com/tunnels/agents → cierra sesiones → re-ejecuta

### "No tienes suficientes tokens"
- **Causa**: Tu balance de caracteres es 0
- **Solución**: Haz clic en "Recargar Tokens" → paga → espera aprobación del admin

### El audio suena con acento raro (Voice Design)
- **Causa**: Las instrucciones deben ser en inglés
- **Solución**: Usa los botones de ejemplo en la interfaz o escribe en inglés detallado

---

## 🔑 Datos Importantes

| Dato | Valor |
|------|-------|
| Tu cuenta ngrok | Revisa en https://dashboard.ngrok.com |
| Token ngrok | 3AHmVRnF9N6DyYMFMSWRiov4prJ_82XMWmkoiqrrdWEpSucHd |
| URL Frontend | https://clonador-de-voz.vercel.app/ |
| Carpeta proyecto | C:\Users\Ale\Desktop\Clonador de voz |
| Notebook Colab | Colab_Backend.ipynb (en Google Drive) |
| GPU Colab gratis | T4 (15GB VRAM, ~12h/día) |
| Admin email | gutierrezalejandro551@gmail.com |
| Supabase Project | Qwen3-TTS Platform (itorbzstfpouasowjvuw) |
| Dashboard Supabase | https://supabase.com/dashboard/project/itorbzstfpouasowjvuw |

---

## 📌 PRÓXIMOS PASOS (Migración a RunPod)
*Nota dejada para la siguiente sesión de desarrollo.*

Actualmente el Backend depende de Google Colab (que se apaga, tiene límites de tiempo y requiere abrir el notebook manualmente). El siguiente objetivo es **migrar el Backend a RunPod Serverless**:

1. **Crear script de Docker/Serverless:** Empaquetar el motor de Qwen3-TTS en una imagen de Docker compatible con los endpoints de RunPod.
2. **Despliegue en RunPod:** Subir la imagen y configurar un Endpoint Serverless (que cobra por segundo solo cuando se generan audios).
3. **Conexión API Genuina:** Reemplazar el uso manual de `ngrok` en el frontend por la URL permanente y la API Key de RunPod. Automático y 24/7.
