package main

import (
	"embed"
	"fmt"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/options/mac"
)

//go:embed all:frontend/dist
var assets embed.FS

func main() {
	app, err := NewDefaultApp()
	if err != nil {
		panic(fmt.Errorf("create app: %w", err))
	}

	err = wails.Run(&options.App{
		Title:            "ZenTerm",
		Width:            1440,
		Height:           920,
		MinWidth:         1080,
		MinHeight:        720,
		BackgroundColour: options.NewRGBA(6, 16, 22, 255),
		AssetServer: &assetserver.Options{
			Assets: assets,
		},
		OnStartup:  app.startup,
		OnShutdown: app.shutdown,
		Bind: []interface{}{
			app,
		},
		Mac: &mac.Options{
			TitleBar:             mac.TitleBarHiddenInset(),
			Appearance:           mac.NSAppearanceNameDarkAqua,
			WebviewIsTransparent: false,
			WindowIsTranslucent:  true,
		},
	})
	if err != nil {
		panic(fmt.Errorf("run wails app: %w", err))
	}
}
