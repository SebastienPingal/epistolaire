//! Point d'entrée sur Vercel. Toute requête `/api/...` arrive ici
//! (voir les réécritures dans `vercel.json`), puis passe par le routeur commun.

use tower::ServiceBuilder;
use vercel_runtime::axum::VercelLayer;
use vercel_runtime::{Error, run};

#[tokio::main]
async fn main() -> Result<(), Error> {
    let app = ServiceBuilder::new()
        .layer(VercelLayer::new())
        .service(epistolaire::routeur());
    run(app).await
}
