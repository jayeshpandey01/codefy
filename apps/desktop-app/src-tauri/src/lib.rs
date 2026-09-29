// Worker-only architecture (see CLAUDE.md Part 6 / the build plan's Part 6):
// the analysis engine runs entirely in a Web Worker inside the frontend via
// @whoami/core/wasm. This Rust side exists ONLY to grant the frontend
// filesystem access -- the dialog plugin (folder picker) and fs plugin
// (recursive read), both called from the main thread's own
// src/bridge/workspaceFs.ts, never from the Worker. Bespoke Rust-side
// commands are kept to a minimum. Scan diagnostics are forwarded
// here so they appear in the terminal running `tauri dev`, rather than only
// in the WebView developer console.
//
// updater + process: back the release pipeline's auto-update flow (see
// docs -- the "WhoAmI Release & Update Pipeline" doc, Step 5). The update
// check/download/verify runs entirely in the updater plugin's Rust side
// against the endpoint + pubkey configured in tauri.conf.json; the frontend
// (src/bridge/TauriBridgeClient.ts) only calls the plugins' JS APIs
// (check(), downloadAndInstall(), relaunch()); scan diagnostics also use the
// IPC bridge so they can be printed in the terminal.
//
// http: carries the cloud orchestrator's requests (register target, submit/
// poll SAST & DAST scans, ...). The orchestrator sends no CORS headers, so the
// webview's own fetch is blocked; the plugin's fetch runs the request from
// Rust instead. Allowed hosts are scoped in capabilities/default.json. The
// frontend passes the plugin's fetch into @whoami/core's
// ScanOrchestratorClient as its fetchFn. See
// docs/plans/desktop-backend-connection.md.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![log_scan_diagnostic])
        .run(tauri::generate_context!())
        .expect("error while running the WhoAmI desktop app");
}

#[tauri::command]
fn log_scan_diagnostic(level: String, message: String) {
    match level.as_str() {
        "error" => eprintln!("[WhoAmI scan] ERROR {message}"),
        "warn" => eprintln!("[WhoAmI scan] WARN  {message}"),
        _ => println!("[WhoAmI scan] {message}"),
    }
}
