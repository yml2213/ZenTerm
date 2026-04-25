package main

import (
	"errors"

	"zenterm/internal/db"
	"zenterm/internal/security"
	"zenterm/internal/service"
)

func normalizeFrontendError(err error) error {
	switch {
	case err == nil:
		return nil
	case errors.Is(err, security.ErrVaultLocked):
		return security.ErrVaultLocked
	case errors.Is(err, security.ErrEmptyPassword):
		return security.ErrEmptyPassword
	case errors.Is(err, security.ErrInvalidMasterPassword):
		return security.ErrInvalidMasterPassword
	case errors.Is(err, security.ErrInvalidSalt):
		return security.ErrInvalidSalt
	case errors.Is(err, security.ErrInvalidKeyLength):
		return security.ErrInvalidKeyLength
	case errors.Is(err, db.ErrHostIDRequired):
		return db.ErrHostIDRequired
	case errors.Is(err, db.ErrHostNotFound):
		return db.ErrHostNotFound
	case errors.Is(err, db.ErrStorePathEmpty):
		return db.ErrStorePathEmpty
	case errors.Is(err, db.ErrSessionLogIDRequired):
		return db.ErrSessionLogIDRequired
	case errors.Is(err, db.ErrSessionLogNotFound):
		return db.ErrSessionLogNotFound
	case errors.Is(err, db.ErrSessionTranscriptNotFound):
		return db.ErrSessionTranscriptNotFound
	case errors.Is(err, service.ErrNilDependency):
		return service.ErrNilDependency
	case errors.Is(err, service.ErrNoIdentityAuth):
		return service.ErrNoIdentityAuth
	case errors.Is(err, service.ErrHostAddressRequired):
		return service.ErrHostAddressRequired
	case errors.Is(err, service.ErrHostUsernameRequired):
		return service.ErrHostUsernameRequired
	case errors.Is(err, service.ErrInvalidTerminalSize):
		return service.ErrInvalidTerminalSize
	case errors.Is(err, service.ErrSessionNotFound):
		return service.ErrSessionNotFound
	case errors.Is(err, service.ErrHostHasActiveSession):
		return service.ErrHostHasActiveSession
	case errors.Is(err, service.ErrVaultAlreadyInitialized):
		return service.ErrVaultAlreadyInitialized
	case errors.Is(err, service.ErrVaultNotInitialized):
		return service.ErrVaultNotInitialized
	case errors.Is(err, service.ErrHostKeyRejected):
		return service.ErrHostKeyRejected
	case errors.Is(err, service.ErrHostKeyConfirmationPending):
		return service.ErrHostKeyConfirmationPending
	case errors.Is(err, service.ErrHostKeyConfirmationNotFound):
		return service.ErrHostKeyConfirmationNotFound
	case errors.Is(err, service.ErrHostKeyMismatch):
		return service.ErrHostKeyMismatch
	case errors.Is(err, service.ErrHostKeyConfirmationTimeout):
		return service.ErrHostKeyConfirmationTimeout
	case errors.Is(err, service.ErrTransferSourceRequired):
		return service.ErrTransferSourceRequired
	case errors.Is(err, service.ErrTransferTargetRequired):
		return service.ErrTransferTargetRequired
	case errors.Is(err, service.ErrTransferSourceNotFile):
		return service.ErrTransferSourceNotFile
	case errors.Is(err, service.ErrTransferTargetNotDirectory):
		return service.ErrTransferTargetNotDirectory
	case errors.Is(err, service.ErrTransferTargetExists):
		return service.ErrTransferTargetExists
	case errors.Is(err, service.ErrFileActionPathRequired):
		return service.ErrFileActionPathRequired
	case errors.Is(err, service.ErrFileNameRequired):
		return service.ErrFileNameRequired
	case errors.Is(err, service.ErrFileEntryAlreadyExists):
		return service.ErrFileEntryAlreadyExists
	default:
		return err
	}
}
