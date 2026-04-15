package main

import (
	"embed"
	"fmt"

	"zenterm/internal/model"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/options/mac"
)

//go:embed all:frontend/dist
var assets embed.FS

func main() {
	storePath, err := DefaultStorePath()
	if err != nil {
		panic(fmt.Errorf("resolve default store path: %w", err))
	}

	windowState, err := LoadSavedWindowState(storePath)
	if err != nil {
		windowState = model.WindowState{}
	}

	app, err := NewDefaultApp()
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
		BackgroundColour: options.NewRGBA(253, 254, 254, 255),
		AssetServer: &assetserver.Options{
			Assets: assets,
		},
		OnStartup:     app.startup,
		OnBeforeClose: app.beforeClose,
		OnShutdown:    app.shutdown,
		Bind: []interface{}{
			app,
		},
		Mac: &mac.Options{
			TitleBar:             mac.TitleBarHiddenInset(),
			Appearance:           mac.DefaultAppearance,
			WebviewIsTransparent: false,
			WindowIsTranslucent:  false,
		},
	})
	if err != nil {
		panic(fmt.Errorf("run wails app: %w", err))
	}
}
