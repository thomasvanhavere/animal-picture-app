/**
 * main.ts : the starting point of the web page
 *
 * index.html loads this file. It loads the styles, then starts the page with
 * the real elements and the real API client. The actual behaviour is in app.ts.
 */
import './styles.css';
import { createPictureApi } from './api/picture-api';
import { findPageElements, startApp } from './app';

startApp(findPageElements(document), createPictureApi());
