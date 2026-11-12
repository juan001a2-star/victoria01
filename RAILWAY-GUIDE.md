# Guia para subir Lottery Pro a Railway.app

## PASO 1: Crear cuenta en Railway

1. Ve a https://railway.app
2. Toca "Get Started" o "Sign Up"
3. Registrate con tu email o con GitHub
4. Verifica tu email

## PASO 2: Crear un nuevo proyecto

1. En el dashboard de Railway, toca "New Project"
2. Selecciona "Deploy from GitHub repo" (necesitas subir el codigo a GitHub primero)

### Para subir a GitHub:

1. Ve a https://github.com/new
2. Nombre del repositorio: `lottery-pro`
3. Dejalo en Publico o Privado (como prefieras)
4. Toca "Create repository"
5. Sube los archivos (ver instrucciones abajo)

### Subir archivos a GitHub:

Opcion A - Por linea de comandos (desde computadora):
```bash
cd lottery-pro
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/TU-USUARIO/lottery-pro.git
git push -u origin main
```

Opcion B - Subir ZIP:
1. Comprime la carpeta `lottery-pro` en un ZIP
2. En GitHub, toca "Uploading an existing file"
3. Sube el ZIP y descomprimelo

## PASO 3: Conectar Railway con GitHub

1. En Railway, toca "New Project"
2. Selecciona "GitHub Repo"
3. Autoriza Railway a acceder a tu GitHub
4. Selecciona el repositorio `lottery-pro`

## PASO 4: Agregar base de datos MySQL

1. En tu proyecto de Railway, toca "New"
2. Selecciona "Database" -> "Add MySQL"
3. Railway creara automaticamente la base de datos

## PASO 5: Configurar variables de entorno

1. En Railway, ve a tu servicio (el proyecto)
2. Toca la pestana "Variables"
3. Agrega estas variables:

```
DATABASE_URL = ${{MySQL.MYSQL_URL}}
```

Railway automaticamente reemplaza `${{MySQL.MYSQL_URL}}` con la URL real de tu base de datos.

### Si necesitas configurar manualmente, usa estos valores:
- Host: Lo muestra Railway en la seccion de MySQL
- Port: 3306
- User: Lo muestra Railway
- Password: Lo muestra Railway
- Database: Lo muestra Railway

## PASO 6: Desplegar

1. Railway detectara automaticamente el `railway.toml` y el `Dockerfile`
2. Cada vez que hagas `git push` a GitHub, Railway reconstruira y desplegara automaticamente
3. Toca "Deploy" si no se despliega automaticamente

## PASO 7: Obtener tu URL

1. Espera que el deploy termine (verde = listo)
2. En Railway, ve a tu servicio
3. Toca la pestana "Settings"
4. En "Environment", copia la URL de "Public Domain"
5. Esa es tu URL! Se ve algo como: `https://lottery-pro.up.railway.app`

## PASO 8: Acceder a tu app

1. Abre la URL en tu celular
2. Entra con: `admin` / `admin123`
3. Veras el indicador "Online" en verde

## Caracteristicas con Railway:

| Feature | Disponible |
|---------|-----------|
| Backend real | Si |
| Base de datos MySQL | Si |
| URL personalizada | Si (puedes usar dominio propio) |
| SSL/HTTPS | Si (automatico) |
| Backup de datos | Si (MySQL en Railway) |
| Escalabilidad | Si |

## Precios:

- Railway tiene plan **gratuito** con limites:
  - 500 horas de uso al mes (como 20 dias)
  - Base de datos MySQL incluida
- Plan pagado: $5/mes por proyecto

## Solucion de problemas:

### Si no conecta la base de datos:
1. Ve a Variables en Railway
2. Verifica que DATABASE_URL esta configurada
3. Reinicia el servicio (toca "Restart")

### Si el deploy falla:
1. Ve a "Deployments" en Railway
2. Toca el deploy que fallo
3. Lee los logs para ver el error
4. Corrige y haz git push de nuevo

### Para reiniciar todo:
1. Ve a MySQL en Railway
2. Toca "Connect" -> "Reset"
3. Reinicia el servicio principal
4. Los datos iniciales se recrearan automaticamente
