/*global document window*/
import type { CssVariables } from '@gitkraken/gitkraken-components';
import React from 'react';
import { render, unmountComponentAtNode } from 'react-dom';
import type { GraphConfig } from '../../../../config';
import type {
	CommitListCallback,
	GraphColumnConfig,
	GraphCommit,
	GraphRepository,
	State,
} from '../../../../plus/webviews/graph/protocol';
import {
	ColumnChangeCommandType,
	DidChangeCommitsNotificationType,
	DidChangeConfigNotificationType,
	DidChangeNotificationType,
	MoreCommitsCommandType,
	SelectRepositoryCommandType,
	UpdateSelectionCommandType,
} from '../../../../plus/webviews/graph/protocol';
import { debounce } from '../../../../system/function';
import { DidChangeConfigurationNotificationType, onIpc } from '../../../../webviews/protocol';
import { App } from '../../shared/appBase';
import { mix, opacity } from '../../shared/colors';
import { GraphWrapper } from './GraphWrapper';
import './graph.scss';

export class GraphApp extends App<State> {
	private callback?: CommitListCallback;
	private $menu?: HTMLElement;

	constructor() {
		super('GraphApp');
	}

	protected override onBind() {
		const disposables = super.onBind?.() ?? [];

		this.log('GraphApp onBind log', this.state.log);

		const $root = document.getElementById('root');
		if ($root != null) {
			render(
				<GraphWrapper
					subscriber={(callback: CommitListCallback) => this.registerEvents(callback)}
					onColumnChange={debounce(
						(name: string, settings: GraphColumnConfig) => this.onColumnChanged(name, settings),
						250,
					)}
					onSelectRepository={debounce((path: GraphRepository) => this.onRepositoryChanged(path), 250)}
					onMoreCommits={(...params) => this.onMoreCommits(...params)}
					onSelectionChange={debounce((selection: GraphCommit[]) => this.onSelectionChanged(selection), 250)}
					{...this.state}
				/>,
				$root,
			);
			disposables.push({
				dispose: () => unmountComponentAtNode($root),
			});
		}

		return disposables;
	}

	protected override onMessageReceived(e: MessageEvent) {
		this.log('onMessageReceived', e);

		const msg = e.data;
		switch (msg.method) {
			case DidChangeNotificationType.method:
				this.log(`${this.appName}.onMessageReceived(${msg.id}): name=${msg.method}`);

				onIpc(DidChangeNotificationType, msg, params => {
					this.setState({ ...this.state, ...params.state });
					this.refresh(this.state);
				});
				break;

			case DidChangeCommitsNotificationType.method:
				this.log(`${this.appName}.onMessageReceived(${msg.id}): name=${msg.method}`);

				onIpc(DidChangeCommitsNotificationType, msg, params => {
					this.setState({
						...this.state,
						commits: params.commits,
						log: params.log,
					});
					this.refresh(this.state);
				});
				break;

			case DidChangeConfigNotificationType.method:
				this.log(`${this.appName}.onMessageReceived(${msg.id}): name=${msg.method}`);

				onIpc(DidChangeConfigNotificationType, msg, params => {
					this.setState({ ...this.state, config: params.config });
					this.refresh(this.state);
				});
				break;

			case DidChangeConfigurationNotificationType.method:
				this.log(`${this.appName}.onMessageReceived(${msg.id}): name=${msg.method}`);

				onIpc(DidChangeConfigurationNotificationType, msg, params => {
					this.setState({ ...this.state, mixedColumnColors: this.getGraphColors(params.config.graph) });
					this.refresh(this.state);
				});
				break;

			default:
				super.onMessageReceived?.(e);
		}
	}

	private getGraphColors(config: GraphConfig | undefined): CssVariables {
		// this will be called on theme updated as well as on config updated since it is dependent on the column colors from config changes and the background color from the theme
		const body = document.body;
		const computedStyle = window.getComputedStyle(body);
		const bgColor = computedStyle.getPropertyValue('--color-background');
		const columnColors =
			config?.columnColors != null
				? config.columnColors
				: ['#00bcd4', '#ff9800', '#9c27b0', '#2196f3', '#009688', '#ffeb3b', '#ff5722', '#795548'];
		const mixedGraphColors: CssVariables = {};
		for (let i = 0; i < columnColors.length; i++) {
			mixedGraphColors[`--graph-color-${i}`] = columnColors[i];
			mixedGraphColors[`--column-${i}-color`] = columnColors[i];
			for (const mixInt of [15, 25, 45, 50]) {
				mixedGraphColors[`--graph-color-${i}-bg${mixInt}`] = mix(bgColor, columnColors[i], mixInt);
			}
			for (const mixInt of [10, 50]) {
				mixedGraphColors[`--graph-color-${i}-f${mixInt}`] = opacity(columnColors[i], mixInt);
			}
		}
		return mixedGraphColors;
	}

	protected override onThemeUpdated() {
		this.setState({ ...this.state, mixedColumnColors: this.getGraphColors(this.state.config) });
		this.refresh(this.state);
	}

	private onColumnChanged(name: string, settings: GraphColumnConfig) {
		this.sendCommand(ColumnChangeCommandType, {
			name: name,
			config: settings,
		});
	}

	private onRepositoryChanged(repo: GraphRepository) {
		this.sendCommand(SelectRepositoryCommandType, {
			path: repo.path,
		});
	}

	private onMoreCommits(limit?: number) {
		this.sendCommand(MoreCommitsCommandType, {
			limit: limit,
		});
	}

	private onSelectionChanged(selection: GraphCommit[]) {
		this.sendCommand(UpdateSelectionCommandType, {
			selection: selection,
		});
	}

	private registerEvents(callback: CommitListCallback): () => void {
		this.callback = callback;

		return () => {
			this.callback = undefined;
		};
	}

	private refresh(state: State) {
		if (this.callback !== undefined) {
			this.callback(state);
		}
	}
}

new GraphApp();
