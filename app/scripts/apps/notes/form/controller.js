/* global define */
define([
    'underscore',
    'app',
    'marionette',
    'collections/notes',
    'collections/tags',
    'collections/notebooks',
    'collections/files',
    'models/note',
    'apps/notes/form/formView',
    'checklist',
    'tags'
], function (_, App, Marionette, NotesCollection, TagsCollection, NotebooksCollection, FilesCollection, NoteModel, View, Checklist, Tags) {
    'use strict';

    var Form = App.module('AppNote.Form');

    Form.Controller = Marionette.Controller.extend({
        initialize: function () {
            _.bindAll(this, 'addForm', 'editForm', 'show', 'fetchImages', 'redirect', 'confirmRedirect');
            App.trigger('notes:show', {filter: null, page: null});

            this.tags = new TagsCollection();
            this.notebooks = new NotebooksCollection();
            this.files = new FilesCollection();
        },

        /**
         * Add a new note
         */
        addForm: function () {
            this.model = new NoteModel();

            $.when(
                this.tags.fetch(),
                this.notebooks.fetch()
            ).done(this.show);
        },

        /**
         * Edit an existing note
         */
        editForm: function (args) {
            this.model = new NoteModel({ id : args.id });

            $.when(
                this.tags.fetch({ limit : 100 }),
                this.notebooks.fetch(),
                this.model.fetch()
            ).done(this.fetchImages);
        },

        fetchImages: function () {
            $.when(
                this.files.fetchImages(this.model.get('images'))
            ).done(this.show);
        },

        show: function () {
            var decrypted;

            decrypted = {
                title : App.Encryption.API.decrypt(this.model.get('title')),
                content : App.Encryption.API.decrypt(this.model.get('content')),
            };

            this.view = new View({
                model     : this.model,
                decrypted : decrypted,
                tags      : this.tags,
                notebooks : this.notebooks,
                files     : this.files
            });

            App.content.show(this.view);

            this.model.on('save', this.save, this);

            this.view.on('redirect', this.redirect, this);
            this.view.on('uploadImages', this.uploadImages, this);
            this.view.trigger('shown');
        },

        // Uploading images to indexDB
        uploadImages: function (imgs) {
            var self = this;
            $.when(this.files.uploadImages(imgs.images)).done(function (data) {
                self.model.trigger('attachImages', {
                    images: data,
                    callback: imgs.callback
                });
            });
        },

        save: function (data) {
            var notebook;

            // Get new data
            data.title = this.view.ui.title.val().trim();
            data.notebookId = parseInt(this.view.ui.notebookId.val().trim());

            // New notebook
            notebook = this.model.get('notebookId');
            if (data.notebookId !== notebook) {
                notebook = this.notebooks.get(data.notebookId);
                data.notebookId = (notebook) ? notebook.get('id') : 0;
            }

            data.images = [];
            this.view.options.files.forEach(function (img) {
                data.images.push(img.get('id'));
            });

            // Tasks
            var checklist = new Checklist().count(data.content);
            data.taskAll = checklist.all;
            data.taskCompleted = checklist.completed;

            // Tags
            data.tags = $.merge(new Tags().getTags(data.content), new Tags().getTags(data.title));

            // Encryption
            data.title = App.Encryption.API.encrypt(_.escape(data.title));
            data.content = App.Encryption.API.encrypt(data.content);

            // Save
            this.model.trigger('update:any');

            $.when(
                // Save changes
                this.model.save(data),
                // Add new tags
                this.tags.saveAdd(data.tags)
            ).done(this.redirect(data.redirect));
        },

        confirmRedirect: function (args) {
            var self = this;
            if (args.isUnchanged === true) {
                this.redirect(args.mayRedirect);
            } else {
                App.Confirm.show({
                    content : $.t('Are you sure? You have unsaved changes'),
                    success : function () {
                        self.redirect(args.mayRedirect);
                    }
                });
            }
        },

        redirect: function (showNote) {
            var url = 'notes';
            if (typeof showNote === 'object') {
                return this.confirmRedirect(showNote);
            }

            App.content.reset();
            App.trigger('notes:added', this.model);

            if (typeof this.model.get('id') === 'undefined') {
                App.navigateBack(url, true);
            } else {
                url += showNote === true ? '/show/' : '/edit/';
                url += this.model.get('id');
                App.navigate(url, true);
            }
        }

    });

    return Form.Controller;
});
