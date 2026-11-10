// Recompile le serveur quand une migration change : elles sont embarquées dans le programme.
fn main() {
    println!("cargo:rerun-if-changed=migrations");
}
