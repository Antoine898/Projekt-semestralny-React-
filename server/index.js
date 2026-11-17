const { createApp } = require("./app");

async function start() {
  const { app } = await createApp();
  const port = Number(process.env.PORT) || 3000;
  app.listen(port, () => {
    console.log(`Serwer LigaScore działa pod adresem http://localhost:${port}`);
  });
}

start().catch((error) => {
  console.error("Nie udało się uruchomić serwera:", error);
  process.exitCode = 1;
});
