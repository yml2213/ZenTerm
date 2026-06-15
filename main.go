package main

import (
	"embed"
	"fmt"

	"zenterm/cmd"
	"zenterm/internal/db"
	"zenterm/internal/model"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/options/mac"
)

//go:embed all:frontend/dist
var assets embed.FS

func main() {
	storePath, err := cmd.DefaultStorePath()
	if err != nil {
		panic(fmt.Errorf("resolve default store path: %w", err))
	}

	windowState, err := cmd.LoadSavedWindowState(storePath)
	if err != nil {
		windowState = model.WindowState{}
	}

	appPreferences := db.LoadAppPreferencesFromFile(storePath)

	app, err := cmd.NewDefaultApp()
	if err != nil {
		panic(fmt.Errorf("create app: %w", err))
	}

	width := 1440
	height := 920
	startState := options.Normal
	if windowState.Width > 0 {
		width = windowState.Width
	}
	if windowState.Height > 0 {
		height = windowState.Height
	}
	if windowState.Maximised {
		startState = options.Maximised
	}

	err = wails.Run(&options.App{
		Title:            "ZenTerm",
		Width:            width,
		Height:           height,
		MinWidth:         1080,
		MinHeight:        720,
		WindowStartState: startState,
		BackgroundColour: options.NewRGBA(5, 7, 11, 0),
		AssetServer: &assetserver.Options{
			Assets: assets,
		},
		Menu:          cmd.BuildApplicationMenu(app),
		OnStartup:     app.Startup,
		OnBeforeClose: app.BeforeClose,
		OnShutdown:    app.Shutdown,
		Bind: []interface{}{
			app,
		},
		Mac: &mac.Options{
			TitleBar:             mac.TitleBarHiddenInset(),
			Appearance:           mac.DefaultAppearance,
			WebviewIsTransparent: true,
			WindowIsTranslucent:  true,
		},
		Debug: options.Debug{
			OpenInspectorOnStartup: appPreferences.OpenInspectorOnStartup,
		},
	})
	if err != nil {
		panic(fmt.Errorf("run wails app: %w", err))
	}
}
